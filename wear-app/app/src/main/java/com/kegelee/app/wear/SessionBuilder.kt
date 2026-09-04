package com.kegelee.app.wear

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * One step of a session: hold or release, for this long, at this circle size.
 *
 * `from` and `to` are the circle's scale at the start and end of the step, 0..1.
 * They are what makes the training circle breathe rather than merely count, and
 * they are the reason this app draws the same thing the phone does instead of a
 * generic countdown.
 */
data class PlayStep(
    val phase: String,
    val label: String,
    val seconds: Double,
    val from: Double,
    val to: Double,
    val slug: String,
) {
    val isContract: Boolean get() = phase == "contract"
    val isRest: Boolean get() = slug == "rest"
}

data class Playlist(
    val steps: List<PlayStep>,
    val exercises: List<String>,
    val totalSeconds: Double,
)

/**
 * A direct port of the phone app's `services/sessionBuilder.ts`.
 *
 * Deliberately line-for-line rather than reinterpreted, down to the rounding
 * and the two while-loops that keep a set inside its catalogue bounds. A watch
 * that built "roughly the same" session would give a different workout from the
 * phone for the same account on the same day, and the difference would be
 * invisible until somebody counted.
 *
 * The phone remains the place to CHANGE any of this; this is a mirror, and the
 * comments below say what each piece is for so the mirror can be re-checked.
 */
object SessionBuilder {

    /** Levels run 1..5, so the top of the range is 5. */
    private const val TOP_LEVEL = 5

    /**
     * How long one exercise runs at a given level.
     *
     * Interpolates between the exercise's own min and max by level, then rounds
     * to a WHOLE number of its cycles - a half-finished squeeze is not a thing
     * anybody can do - while keeping the result inside the catalogue's bounds
     * at both ends.
     */
    fun durationForLevel(slug: String, levelNumber: Int): Double {
        val cycle = Catalogue.cycleSeconds(slug)
        if (cycle <= 0.0) return 30.0

        val (minSec, maxSec) = Catalogue.durationBounds(slug)
        val pct = if (TOP_LEVEL > 1) {
            max(0.0, min(1.0, (levelNumber - 1).toDouble() / (TOP_LEVEL - 1)))
        } else 0.0
        val target = minSec + (maxSec - minSec) * pct

        var cycles = max(1, (target / cycle).roundToInt())
        // Never blow past the maximum on rounding...
        while (cycles > 1 && cycles * cycle > maxSec + 0.01) cycles--
        // ...and symmetrically, never fall short of the minimum. Only the
        // maximum used to be guarded on the phone, which let a rounded set come
        // out shorter than the catalogue said the exercise was.
        while (cycles * cycle < minSec - 0.01 && (cycles + 1) * cycle <= maxSec + 0.01) cycles++

        return ((cycles * cycle) * 10).roundToInt() / 10.0
    }

    private fun steps(slug: String, duration: Double): List<Segment> {
        val def = Catalogue.exercises[slug] ?: return emptyList()
        val cycle = Catalogue.cycleSeconds(slug)
        val reps = if (cycle > 0) max(1, ((duration / cycle) + 1e-6).toInt()) else 0
        val out = mutableListOf<Segment>()
        repeat(reps) { out += def.pattern }
        return out
    }

    /**
     * The day's session.
     *
     * @param completedDays how far through the plan this account is - it is
     *        what unlocks exercises.
     * @param entitled a free account is bounded twice: its day count stops
     *        early AND the pool is narrowed here, so a day count that arrived
     *        from a period when the account was paying still cannot produce a
     *        paid exercise.
     */
    fun buildDaily(completedDays: Int, levelNumber: Int, entitled: Boolean): Playlist {
        val level = Catalogue.level(levelNumber)
        val total = level.totalSessionSeconds.toDouble()
        val rest = level.restSeconds.toDouble()

        val unlocked = Catalogue.availableSlugs(completedDays, entitled)
            .mapNotNull { Catalogue.exercises[it] }
        if (unlocked.isEmpty()) return Playlist(emptyList(), emptyList(), 0.0)

        val pool = unlocked.shuffled()
        val sequence = mutableListOf<ExerciseDef>()
        val durations = mutableListOf<Double>()
        var acc = 0.0
        var idx = 0

        // 30 is the phone's own ceiling: a guard against a pool of very short
        // exercises filling a long level with an unreadable number of blocks.
        while (sequence.size < 30) {
            var candidate = pool[idx % pool.size]
            // Never the same exercise twice in a row while there is an
            // alternative - back-to-back identical blocks read as a stutter.
            if (sequence.isNotEmpty() && sequence.last().slug == candidate.slug && pool.size > 1) {
                idx++
                candidate = pool[idx % pool.size]
            }

            val duration = durationForLevel(candidate.slug, levelNumber)
            val addition = (if (sequence.isEmpty()) 0.0 else rest) + duration

            // Stop at whichever side of the target is CLOSER, rather than
            // always stopping short: a session two seconds over is nearer the
            // level's length than one twenty seconds under.
            if (sequence.isNotEmpty() && acc + addition > total) {
                val over = (acc + addition) - total
                val under = total - acc
                if (over >= under) break
            }

            durations += duration
            sequence += candidate
            acc += addition
            idx++

            if (acc >= total) break
        }

        val out = mutableListOf<PlayStep>()
        val exercises = mutableListOf<String>()
        var finalAcc = 0.0

        sequence.forEachIndexed { i, exercise ->
            if (i > 0 && rest > 0) {
                out += PlayStep(
                    phase = "relax",
                    label = Catalogue.label("catalogue.steps.rest"),
                    seconds = rest,
                    from = 0.0,
                    to = 0.0,
                    slug = "rest",
                )
                finalAcc += rest
            }

            steps(exercise.slug, durations[i]).forEach { s ->
                out += PlayStep(
                    phase = s.phase,
                    label = Catalogue.label(s.labelKey),
                    seconds = s.seconds,
                    from = s.from,
                    to = s.to,
                    slug = exercise.slug,
                )
                finalAcc += s.seconds
            }

            if (exercise.slug !in exercises) exercises += exercise.slug
        }

        return Playlist(out, exercises, (finalAcc * 10).roundToInt() / 10.0)
    }

    /**
     * Every exercise at every level, as this app computes it.
     *
     * Exists so "are the exercises the same as the phone?" can be answered by
     * DIFFING rather than by looking. It emits the real Kotlin output - the same
     * `durationForLevel` and `steps` a session uses - which is the only version
     * worth checking; a transcription of this logic into another language would
     * only prove the transcription right.
     *
     * The phone dumps the same shape from its own test runner, so the two files
     * can be compared byte for byte. See scripts/compare-exercises.cjs.
     *
     * Debug builds only: `MainActivity` guards the call behind BuildConfig.DEBUG,
     * so nothing here reaches a release.
     */
    /**
     * Which exercises are available at a given day count, on both tiers.
     *
     * Added because "Front Clamp appeared and it was not unlocked" is a
     * question about the GATE, and the step dump does not cover the gate at
     * all - it compares what an exercise does, not whether it should have been
     * offered. This compares the pool itself.
     */
    fun dumpGateForComparison(): String {
        val q = '"'
        val days = listOf(0, 1, 2, 3, 5, 7, 14, 20, 36, 50, 109, 200)
        val out = StringBuilder()
        out.appendLine("{")
        days.forEachIndexed { di, d ->
            out.appendLine("  $q$d$q: {")
            listOf(true, false).forEachIndexed { ei, entitled ->
                val slugs = Catalogue.availableSlugs(d, entitled)
                val cells = slugs.joinToString(", ") { "$q$it$q" }
                val comma = if (ei == 0) "," else ""
                out.appendLine("    $q$entitled$q: [$cells]$comma")
            }
            out.appendLine(if (di < days.size - 1) "  }," else "  }")
        }
        out.appendLine("}")
        return out.toString()
    }

    fun dumpAllForComparison(): String {
        val q = '"'
        val out = StringBuilder()
        out.appendLine("{")
        val slugs = Catalogue.exercises.values.sortedBy { it.sortOrder }.map { it.slug }
        slugs.forEachIndexed { si, slug ->
            out.appendLine("  $q$slug$q: {")
            for (level in 1..5) {
                val duration = durationForLevel(slug, level)
                val steps = steps(slug, duration)
                val cells = steps.joinToString(", ") { st ->
                    "$q${st.phase} ${trim(st.seconds)} ${trim(st.from)}->${trim(st.to)}$q"
                }
                val comma = if (level < 5) "," else ""
                out.appendLine("    $q$level$q: {${q}duration$q: ${trim(duration)}, ${q}steps$q: [$cells]}$comma")
            }
            out.appendLine(if (si < slugs.size - 1) "  }," else "  }")
        }
        out.appendLine("}")
        return out.toString()
    }

    /** Numbers as the phone's JSON writes them: 29 not 29.0, 2.4 stays 2.4. */
    private fun trim(v: Double): String =
        if (v == v.toLong().toDouble()) v.toLong().toString() else v.toString()
}
