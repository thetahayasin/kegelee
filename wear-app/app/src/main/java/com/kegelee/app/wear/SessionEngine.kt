package com.kegelee.app.wear

import android.content.Context
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel

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

    /**
     * How far through the current step, 0f..1f.
     *
     * `mutableFloatStateOf`, not `mutableStateOf<Float>`: the boxed one
     * allocates a java.lang.Float on every write, and this is written on every
     * frame. Sixty allocations a second is exactly the kind of thing that makes
     * a watch feel sticky.
     */
    var stepProgress by mutableFloatStateOf(0f)
        private set

    /** Whole seconds left in the current step, for the numeral. */
    var stepRemaining by mutableIntStateOf(0)
        private set

    /** Seconds elapsed across the whole session, for the record we send back. */
    var elapsedSeconds by mutableIntStateOf(0)
        private set

    private var steps: List<PlayStep> = emptyList()

    /** Wall clock when the current step began, adjusted for time spent paused. */
    private var stepStartedAt = 0L
    private var sessionStartedAt = 0L
    private var pausedAt = 0L

    /**
     * The step being run, or null once the session has run off the end.
     *
     * Deliberately the RAW index, not the clamped one. `tick` detects the end
     * of the session by this going null, so clamping it here - which a previous
     * attempt did, to stop the block maths reading past the list - meant the
     * session never finished at all. The clamp belongs to the display getters
     * below, which have to survive the frame between the last increment and
     * `finish()`; this one has to report the truth.
     */
    val currentStep: PlayStep? get() = steps.getOrNull(stepIndex)
    val totalSteps: Int get() = steps.size

    /** 0f..1f across the whole session, for the outer arc. */
    val sessionProgress: Float
        get() = if (steps.isEmpty()) 0f else (stepIndex + stepProgress) / steps.size

    /**
     * How hard the squeeze should be right now, 0f..1f.
     *
     * `from` and `to` come from the catalogue and the step's own progress moves
     * between them - but through a smoothstep, not linearly. The phone eases
     * the same way (`t * t * (3 - 2t)` in WorkoutScreen), and it matters: a
     * linear ramp starts and stops abruptly, which reads as a jerk rather than
     * a breath.
     */
    val contraction: Float
        get() {
            val step = currentStep ?: return 0f
            val t = stepProgress.coerceIn(0f, 1f)
            val eased = t * t * (3f - 2f * t)
            return (step.from + (step.to - step.from) * eased).toFloat().coerceIn(0f, 1f)
        }

    /** A rest beat has no glow at all - see the phone's `targetOpacity`. */
    val isResting: Boolean get() = currentStep?.isRest == true

    /**
     * How long the glow may take to reach a new target, in milliseconds.
     *
     * Ported from the phone's smooth-pursuit, and the reason the motion reads
     * as the same app. Two effects, both deliberate:
     *
     *  - The chase is proportional to the step, clamped to 80..240ms. A fixed
     *    filter swallowed most of a 0.3s step, which came out as a dead pause
     *    between reps.
     *  - A step ENTERED with a big jump gets longer to settle. Front Clamp
     *    builds to full over three seconds then drops instantly; without this
     *    the fall collapsed in two frames and then sat still for the rest of
     *    the beat. Only real jumps qualify, so the graded Elevator steps stay
     *    crisp - which is the point of those exercises.
     */
    val pursuitMs: Int
        get() {
            val step = currentStep ?: return 240
            val base = (step.seconds * 400).toInt().coerceIn(80, 240)
            val entryFrom = steps.getOrNull(safeIndex - 1)?.to ?: 0.0
            val entryJump = kotlin.math.abs(step.from - entryFrom)
            val settle = if (entryJump > 0.3) {
                minOf(entryJump * 520.0, step.seconds * 1000.0 * 0.6).toInt()
            } else 0
            return maxOf(base, settle)
        }

    // --- Blocks -------------------------------------------------------------

    /**
     * A BLOCK is one exercise, or one rest - not one step.
     *
     * This distinction is the whole reason the first version looked wrong. An
     * exercise is many contract/relax steps in a row, and driving the ring and
     * the numeral from the STEP made them reset every half second: the count
     * read "1, 0, 1, 0" and the arc flicked back to empty on every rep, which
     * says nothing about how far through anything you are.
     *
     * The phone drives both from the block (`getBlockPct` / `getBlockRemaining`
     * in WorkoutScreen), so the ring fills once across a whole exercise and the
     * number counts that exercise down. The per-step values still drive the
     * glow, because the squeeze itself IS per step.
     */
    /**
     * `stepIndex` clamped into the list.
     *
     * The final tick increments past the last step and only then calls
     * `finish()`, so a recomposition landing in between asked the block maths
     * about index 107 of a 107-step session and took the whole app down.
     */
    private val safeIndex: Int
        get() = if (steps.isEmpty()) 0 else stepIndex.coerceIn(0, steps.lastIndex)

    /**
     * The current block's bounds, computed once when the block CHANGES.
     *
     * This used to be worked out from scratch on every read: two loops walking
     * outward to find the block's edges, then an IntRange allocated and summed
     * to total it. `blockProgress` called it twice, `blockRemaining` again, and
     * a `derivedStateOf` read them every frame to see whether a once-a-second
     * number had moved - so a session was walking its own step list and
     * allocating ranges sixty times a second to redraw an arc. On a watch that
     * is exactly the kind of quiet waste that turns into visible stutter.
     *
     * Recomputed only when the step index leaves the cached block, which is a
     * few times a minute.
     */
    private var cachedBlockFor = -1
    private var cachedStart = 0
    private var cachedEnd = 0
    private var cachedTotal = 1.0
    private var cachedTailAfter = DoubleArray(0)

    private fun ensureBlock(index: Int) {
        if (steps.isEmpty()) return
        if (index in cachedStart..cachedEnd && cachedBlockFor >= 0) return

        val slug = steps[index].slug
        var start = index
        while (start > 0 && steps[start - 1].slug == slug) start--
        var end = index
        while (end + 1 < steps.size && steps[end + 1].slug == slug) end++

        cachedStart = start
        cachedEnd = end
        cachedBlockFor = index
        var total = 0.0
        for (i in start..end) total += steps[i].seconds
        cachedTotal = total.coerceAtLeast(1.0)

        /**
         * Seconds remaining AFTER each step in the block, precomputed.
         *
         * Turns "how much of this exercise is left" into one array lookup plus
         * the current step's own remainder, instead of a loop-and-sum per read.
         */
        val tail = DoubleArray(end - start + 1)
        var running = 0.0
        for (i in end downTo start) {
            tail[i - start] = running
            running += steps[i].seconds
        }
        cachedTailAfter = tail
    }

    /** Which block is running. */
    val blockIndex: Int
        get() {
            if (steps.isEmpty()) return 0
            ensureBlock(safeIndex)
            return cachedStart
        }

    /** Seconds still to run in the current block, unrounded. */
    private val blockRemainingRaw: Double
        get() {
            val step = currentStep ?: return 0.0
            ensureBlock(safeIndex)
            val inStep = (step.seconds * (1f - stepProgress)).toDouble()
            val after = cachedTailAfter.getOrElse(safeIndex - cachedStart) { 0.0 }
            return (inStep + after).coerceAtLeast(0.0)
        }

    /** What the big numeral shows: seconds left in this exercise. */
    val blockRemaining: Int
        get() = kotlin.math.ceil(blockRemainingRaw).toInt().coerceAtLeast(0)

    /** What the ring fills with: progress through this exercise, 0f..1f. */
    val blockProgress: Float
        get() {
            if (steps.isEmpty()) return 0f
            ensureBlock(safeIndex)
            return ((cachedTotal - blockRemainingRaw) / cachedTotal).toFloat().coerceIn(0f, 1f)
        }

    /** The exercise this block trains, or "rest". */
    val blockSlug: String get() = currentStep?.slug.orEmpty()

    /**
     * The exercise after this rest, so the rest can say what it is leading to.
     *
     * Only meaningful during a rest; an exercise block has no "next" worth
     * announcing while it is still running.
     */
    val nextExerciseSlug: String?
        get() {
            if (!isResting) return null
            ensureBlock(safeIndex)
            return steps.getOrNull(cachedEnd + 1)?.slug?.takeIf { it != "rest" }
        }

    // --- The chase -----------------------------------------------------------

    /**
     * The phone does not draw its targets. It CHASES them.
     *
     * `updateGlowAnimation` runs on a 50ms tick and each time restarts an
     * `Animated.timing` from wherever the value currently is toward the new
     * target, over `pursuitMs`, with `Easing.out(Easing.quad)`. The result is a
     * low-pass filter: a gradual ramp is tracked with negligible lag, while a
     * step boundary's jump eases out instead of snapping in one frame.
     *
     * Feeding the target straight to the screen - which is what this did until
     * now - produces the right numbers with the wrong motion, and for an
     * exercise the motion IS the instruction. So the structure is reproduced
     * exactly: a pursuit restarted every 50ms, evaluated every frame.
     */
    private class Chase(var value: Float) {
        var from = value
        var to = value
        var startedAt = 0L
        var durationMs = 1

        fun retarget(target: Float, durationMs: Int, now: Long) {
            from = value
            to = target
            startedAt = now
            this.durationMs = durationMs.coerceAtLeast(1)
        }

        /** @param easeOutQuad false for a linear chase, as the ring uses. */
        fun advance(now: Long, easeOutQuad: Boolean) {
            val t = ((now - startedAt).toFloat() / durationMs).coerceIn(0f, 1f)
            val eased = if (easeOutQuad) 1f - (1f - t) * (1f - t) else t
            value = from + (to - from) * eased
        }
    }

    /** Scale 0.58..1.0 and alpha 0.08..1.0, exactly the phone's ranges. */
    private val glowScaleChase = Chase(0.58f)
    private val glowAlphaChase = Chase(0.08f)
    /** The ring's own arc, chased linearly - see `LiveProgressRing`. */
    private val ringChase = Chase(0f)

    private var lastPursuitAt = 0L
    private var lastPushedPct = -1f
    private var lastPushAt = 0L

    /**
     * The three values the screen actually draws.
     *
     * Backed by plain floats updated inside `tick`, and published through
     * `mutableFloatStateOf` so a deferred read in the draw phase sees them.
     */
    var glowScale by mutableFloatStateOf(0.58f)
        private set
    var glowAlpha by mutableFloatStateOf(0.08f)
        private set
    var ringPct by mutableFloatStateOf(0f)
        private set

    /** The phone's own tick cadence, which the pursuit timings are sized for. */
    private val PURSUIT_TICK_MS = 50L

    private fun runPursuit(now: Long) {
        // 1. The glow. Target and duration exactly as updateGlowAnimation.
        val step = currentStep
        val intensity = contraction
        val targetScale = 0.58f + intensity * 0.42f
        val targetAlpha = if (step == null || step.isRest) 0f else 0.08f + intensity * 0.92f
        val pursuit = pursuitMs
        glowScaleChase.retarget(targetScale, pursuit, now)
        glowAlphaChase.retarget(targetAlpha, pursuit, now)

        /**
         * 2. The ring, which the phone pushes only on real movement.
         *
         * `pushTickDisplays` skips anything that would not change the picture -
         * the same integer count and under 0.2% of arc - so a long, slow step
         * updates well below the tick rate. The chase duration is the gap since
         * the last push that DID happen, clamped 50..250ms, so the arc is still
         * travelling when the next one lands rather than arriving early and
         * waiting.
         */
        val pct = blockProgress
        if (lastPushedPct < 0f || kotlin.math.abs(pct - lastPushedPct) > 0.002f) {
            val gap = if (lastPushAt == 0L) 50L else (now - lastPushAt)
            ringChase.retarget(pct, gap.coerceIn(50L, 250L).toInt(), now)
            lastPushedPct = pct
            lastPushAt = now
        }
    }

    private fun advanceChases(now: Long) {
        glowScaleChase.advance(now, easeOutQuad = true)
        glowAlphaChase.advance(now, easeOutQuad = true)
        ringChase.advance(now, easeOutQuad = false)
        glowScale = glowScaleChase.value
        glowAlpha = glowAlphaChase.value
        ringPct = ringChase.value
    }

    fun start(newSteps: List<PlayStep>) {
        if (newSteps.isEmpty()) return
        steps = newSteps
        cachedBlockFor = -1
        cachedStart = 0
        cachedEnd = 0
        stepIndex = 0
        elapsedSeconds = 0
        sessionStartedAt = System.currentTimeMillis()
        beginStep()
        val now = System.currentTimeMillis()
        lastPursuitAt = now
        lastPushedPct = -1f
        lastPushAt = 0L
        glowScaleChase.value = 0.58f
        glowAlphaChase.value = 0.08f
        ringChase.value = 0f
        runPursuit(now)
        advanceChases(now)
        phase = Phase.RUNNING
        cue(steps.first())
    }

    fun pause() {
        if (phase != Phase.RUNNING) return
        pausedAt = System.currentTimeMillis()
        phase = Phase.PAUSED
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
    }

    fun stop() {
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

    /**
     * Advance the session. Called once per FRAME by the screen.
     *
     * It used to be a `delay(50)` loop inside the engine - twenty updates a
     * second, on a timer with no relationship to when the display actually
     * redraws. Every third or fourth update landed between frames and was
     * thrown away, and the ones that survived arrived at uneven intervals, so
     * the ring moved in visible steps. Driving it from `withFrameNanos` means
     * one update per frame, aligned to the frame, which is what "smooth"
     * actually is.
     */
    fun tick() {
        val now = System.currentTimeMillis()
        // The pursuit is restarted on the phone's 50ms cadence; the chases are
        // evaluated on every frame. Both halves matter - see `runPursuit`.
        if (now - lastPursuitAt >= PURSUIT_TICK_MS) {
            lastPursuitAt = now
            runPursuit(now)
        }
        advanceChases(now)

        val step = currentStep ?: return finish()
        val lengthMs = (step.seconds * 1000).toLong().coerceAtLeast(1L)
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
        phase = Phase.DONE
        stepProgress = 1f
        stepRemaining = 0
        elapsedSeconds = ((System.currentTimeMillis() - sessionStartedAt) / 1000).toInt()
    }

    // --- Haptics ------------------------------------------------------------

    /**
     * Whether the cue may fire at all.
     *
     * Set by the screen before a session starts, from the stored preference AND
     * the entitlement. Both, because the phone requires both: a lapsed account
     * must stop being buzzed even though its saved preference still says yes.
     */
    var hapticsEnabled: Boolean = false

    private val vibrator: Vibrator? by lazy {
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                appContext.getSystemService(VibratorManager::class.java)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                appContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
        }.getOrNull()
    }

    /**
     * One 60ms buzz, on contraction only. Exactly the phone's cue.
     *
     * This is not UI polish - it tells you when to squeeze while your eyes are
     * off the screen, which is closer to an alarm than to a keypress. Long
     * enough to read through a sleeve, short enough not to smear into the next
     * beat of a staircase exercise, whose steps are a second apart.
     *
     * Deliberately NOT the two-tone scheme this had before - a firm double
     * pulse to squeeze and a soft one to release. That was a nicer idea and a
     * different exercise: the phone buzzes on contraction and stays silent on
     * release, so a release cue here would have people letting go on a signal
     * their phone never gives them. Same reasoning as the circle.
     */
    private fun cue(step: PlayStep) {
        if (!hapticsEnabled || !step.isContract || step.isRest) return
        runCatching {
            /**
             * The usage has to be declared, or the buzz never happens.
             *
             * A `VibrationEffect` sent with no attributes carries USAGE_UNKNOWN,
             * and the system scales that against an intensity setting which is
             * unset on a stock device - so it is silently scaled to zero. The
             * effect is dispatched, the vibrator logs nothing, and no error is
             * raised anywhere: the cue simply never fires. That is exactly what
             * was happening, and it is invisible without looking at
             * `dumpsys vibrator_manager`.
             *
             * ALARM rather than HARDWARE_FEEDBACK, which is what Compose's touch
             * ripple uses. Touch feedback is tied to the screen being looked at
             * and can be filtered when it is not; this cue exists precisely for
             * the moments the wrist is down and the eyes are elsewhere, which is
             * the phone's own reasoning - its comment calls the cue closer to an
             * alarm than to a keypress.
             */
            val attrs = VibrationAttributes.Builder()
                .setUsage(VibrationAttributes.USAGE_ALARM)
                .build()
            vibrator?.vibrate(
                VibrationEffect.createOneShot(CUE_MS, VibrationEffect.DEFAULT_AMPLITUDE),
                attrs,
            )
        }
    }

    private companion object {
        /** The phone's `CUE_MS`. */
        const val CUE_MS = 60L
    }
}
