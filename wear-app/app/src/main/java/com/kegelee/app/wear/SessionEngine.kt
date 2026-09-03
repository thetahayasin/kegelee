package com.kegelee.app.wear

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Runs one guided session.
 *
 * The whole point of doing this on a watch rather than a phone is that the cue
 * can be FELT. Nobody is looking at their wrist through a Kegel session, so the
 * screen is a confirmation and the vibration is the instruction - which is why
 * the haptic fires on the phase boundary and the drawing follows it, not the
 * other way round.
 *
 * Time is measured against the wall clock rather than counted in ticks. A
 * `delay(1000)` loop drifts - the watch throttles timers, the frame is late,
 * the doze kicks in - and over a two-minute session that drift is the
 * difference between a five-second hold and a four-second one. Every frame asks
 * "how long since this step began", so lateness corrects itself instead of
 * accumulating.
 */
class SessionEngine(private val appContext: Context) : ViewModel() {

    enum class Phase { IDLE, RUNNING, PAUSED, DONE }

    var phase by mutableStateOf(Phase.IDLE)
        private set

    /** Index into the step list. */
    var stepIndex by mutableIntStateOf(0)
        private set

    /** How far through the current step, 0f..1f. Drives the ring. */
    var stepProgress by mutableStateOf(0f)
        private set

    /** Whole seconds left in the current step, for the numeral. */
    var stepRemaining by mutableIntStateOf(0)
        private set

    /** Seconds elapsed across the whole session, for the record we send back. */
    var elapsedSeconds by mutableIntStateOf(0)
        private set

    private var steps: List<PlayStep> = emptyList()
    private var ticker: Job? = null

    /** Wall clock when the current step began, adjusted for time spent paused. */
    private var stepStartedAt = 0L
    private var sessionStartedAt = 0L
    private var pausedAt = 0L

    val currentStep: PlayStep? get() = steps.getOrNull(stepIndex)
    val totalSteps: Int get() = steps.size

    /** 0f..1f across the whole session, for the outer arc. */
    val sessionProgress: Float
        get() = if (steps.isEmpty()) 0f else (stepIndex + stepProgress) / steps.size

    /**
     * How contracted the circle is right now, 0f..1f.
     *
     * The catalogue gives every segment a `from` and a `to`, and the circle
     * travels between them across the step. That is what the phone draws and it
     * is the instruction itself: the ring swelling IS "squeeze", and it reads
     * without a word being processed. A countdown alone would be a timer, not a
     * cue.
     */
    val contraction: Float
        get() {
            val step = currentStep ?: return 0f
            return (step.from + (step.to - step.from) * stepProgress).toFloat().coerceIn(0f, 1f)
        }

    fun start(newSteps: List<PlayStep>) {
        if (newSteps.isEmpty()) return
        steps = newSteps
        stepIndex = 0
        elapsedSeconds = 0
        sessionStartedAt = System.currentTimeMillis()
        beginStep()
        phase = Phase.RUNNING
        runTicker()
        cue(steps.first())
    }

    fun pause() {
        if (phase != Phase.RUNNING) return
        pausedAt = System.currentTimeMillis()
        phase = Phase.PAUSED
        ticker?.cancel()
    }

    fun resume() {
        if (phase != Phase.PAUSED) return
        // Slide both clocks forward by the length of the pause, so the step
        // resumes where it stopped instead of jumping to wherever the wall
        // clock has got to.
        val pausedFor = System.currentTimeMillis() - pausedAt
        stepStartedAt += pausedFor
        sessionStartedAt += pausedFor
        phase = Phase.RUNNING
        runTicker()
    }

    fun stop() {
        ticker?.cancel()
        phase = Phase.IDLE
        steps = emptyList()
        stepIndex = 0
        stepProgress = 0f
        stepRemaining = 0
    }

    /** The exercises actually trained, for the record handed to the phone. */
    fun trainedSlugs(): List<String> =
        steps.map { it.slug }.filter { it.isNotBlank() && it != "rest" }.distinct()

    private fun beginStep() {
        stepStartedAt = System.currentTimeMillis()
        stepProgress = 0f
        stepRemaining = (currentStep?.seconds ?: 0.0).toInt().coerceAtLeast(0)
    }

    private fun runTicker() {
        ticker?.cancel()
        ticker = viewModelScope.launch {
            while (isActive && phase == Phase.RUNNING) {
                tick()
                // ~20fps. Fast enough that the ring reads as continuous, slow
                // enough that a watch is not repainting for the sake of it.
                delay(50)
            }
        }
    }

    private fun tick() {
        val step = currentStep ?: return finish()
        val lengthMs = (step.seconds * 1000).toLong().coerceAtLeast(1L)
        val now = System.currentTimeMillis()
        val into = now - stepStartedAt

        elapsedSeconds = ((now - sessionStartedAt) / 1000).toInt()

        if (into >= lengthMs) {
            /**
             * Carry the overshoot into the next step.
             *
             * The tick that notices a step has ended is always a little late,
             * and starting the next step "now" would hand it those extra
             * milliseconds. Over a session of forty steps that is a visible
             * drift, so the next step begins when this one actually ended.
             */
            stepStartedAt += lengthMs
            stepIndex += 1
            val next = currentStep
            if (next == null) {
                finish()
                return
            }
            stepProgress = 0f
            stepRemaining = next.seconds.toInt().coerceAtLeast(0)
            cue(next)
            return
        }

        stepProgress = (into.toFloat() / lengthMs).coerceIn(0f, 1f)
        // Ceiling, so a step reads "5" for its first moment and only reaches
        // "0" as it genuinely ends - a countdown that starts at 4 looks broken.
        stepRemaining = Math.ceil((lengthMs - into) / 1000.0).toInt().coerceAtLeast(0)
    }

    private fun finish() {
        ticker?.cancel()
        phase = Phase.DONE
        stepProgress = 1f
        stepRemaining = 0
        elapsedSeconds = ((System.currentTimeMillis() - sessionStartedAt) / 1000).toInt()
        doneCue()
    }

    // --- Haptics ------------------------------------------------------------

    private val vibrator: Vibrator? by lazy {
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val manager = appContext.getSystemService(VibratorManager::class.java)
                manager?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                appContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
        }.getOrNull()
    }

    /**
     * Two distinguishable cues, because they mean opposite things.
     *
     * A squeeze is a firm double pulse and a release is one soft one, so the
     * difference is legible through a sleeve without looking. A single
     * undifferentiated buzz would tell somebody that *something* changed and
     * leave them to guess which.
     */
    private fun cue(step: PlayStep) {
        val effect = if (step.isContract) {
            VibrationEffect.createWaveform(longArrayOf(0, 90, 80, 90), -1)
        } else {
            VibrationEffect.createWaveform(longArrayOf(0, 45), -1)
        }
        runCatching { vibrator?.vibrate(effect) }
    }

    private fun doneCue() {
        runCatching {
            vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 120, 90, 120, 90, 220), -1))
        }
    }

    override fun onCleared() {
        ticker?.cancel()
        super.onCleared()
    }
}
