package com.kegelee.app.wear

import android.content.Context
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The training catalogue, shipped as an asset rather than written out here.
 *
 * `app/src/main/assets/catalogue.json` is GENERATED from the phone app's own
 * `src/constants/catalogues.ts` - seventeen exercises, five levels, every
 * pattern segment and every English label. Transcribing that into Kotlin by
 * hand would have been a hundred lines of numbers that silently stop matching
 * the phone the first time anybody tunes a hold, and "the watch counts
 * differently from the app" is a bug nobody would think to look for here.
 *
 * To regenerate after changing the phone's catalogue, from react-native-app/:
 *
 *   (a jest run dumps EXERCISES/LEVELS/FREE_EXERCISE_SLUGS, then the English
 *    catalogue.* strings from src/i18n/locales/en.json are merged in as LABELS)
 *
 * The labels come across resolved because a watch carrying its own copy of the
 * translation bundle is a second thing to keep in step for no benefit.
 */
@Serializable
data class Segment(
    @SerialName("phase") val phase: String = "relax",
    @SerialName("labelKey") val labelKey: String = "",
    @SerialName("seconds") val seconds: Double = 0.0,
    /** Circle scale at the start of this segment, 0..1. */
    @SerialName("from") val from: Double = 0.0,
    /** Circle scale at the end. The pair is what makes the circle breathe. */
    @SerialName("to") val to: Double = 0.0,
)

@Serializable
data class ExerciseDef(
    @SerialName("slug") val slug: String = "",
    @SerialName("unlock_after_days") val unlockAfterDays: Int = 0,
    @SerialName("pattern") val pattern: List<Segment> = emptyList(),
    @SerialName("min_seconds") val minSeconds: Double? = null,
    @SerialName("max_seconds") val maxSeconds: Double? = null,
    @SerialName("sort_order") val sortOrder: Int = 0,
)

@Serializable
data class LevelDef(
    @SerialName("number") val number: Int = 1,
    @SerialName("total_session_seconds") val totalSessionSeconds: Int = 60,
    @SerialName("rest_seconds") val restSeconds: Int = 5,
    @SerialName("min_exercises") val minExercises: Int = 3,
)

@Serializable
private data class CatalogueFile(
    @SerialName("EXERCISES") val exercises: Map<String, ExerciseDef> = emptyMap(),
    @SerialName("LEVELS") val levels: Map<String, LevelDef> = emptyMap(),
    @SerialName("FREE_EXERCISE_SLUGS") val free: List<String> = emptyList(),
    @SerialName("LABELS") val labels: Map<String, String> = emptyMap(),
)

object Catalogue {
    private var file: CatalogueFile = CatalogueFile()

    val exercises: Map<String, ExerciseDef> get() = file.exercises
    val levels: Map<String, LevelDef> get() = file.levels
    val freeSlugs: List<String> get() = file.free

    fun load(context: Context) {
        if (file.exercises.isNotEmpty()) return
        runCatching {
            val raw = context.assets.open("catalogue.json").bufferedReader().use { it.readText() }
            file = Json { ignoreUnknownKeys = true }.decodeFromString(CatalogueFile.serializer(), raw)
        }
    }

    /** Resolved English text for an i18n key, falling back to the key itself. */
    fun label(key: String): String = file.labels[key] ?: key.substringAfterLast('.')

    fun exerciseName(slug: String): String = label("catalogue.exercises.$slug")

    fun levelName(number: Int): String = label("catalogue.levels.$number")

    fun level(number: Int): LevelDef = levels[number.toString()] ?: LevelDef()

    /**
     * How many training days a free account can accumulate.
     *
     * Exactly enough to unlock the third free exercise and not one more, which
     * is how the phone defines it - derived from the catalogue rather than
     * written down, so it cannot drift when the free set changes.
     */
    val freeDayCap: Int
        get() = freeSlugs.mapNotNull { exercises[it]?.unlockAfterDays }.maxOrNull() ?: 0

    fun cycleSeconds(slug: String): Double =
        exercises[slug]?.pattern?.sumOf { it.seconds } ?: 0.0

    fun durationBounds(slug: String): Pair<Double, Double> {
        val def = exercises[slug] ?: return 20.0 to 60.0
        return (def.minSeconds ?: 20.0) to (def.maxSeconds ?: 60.0)
    }

    /**
     * The exercises a session may draw on at this point in the plan.
     *
     * Mirrors the phone's own gate: unlocked by day count, and - for an account
     * without a subscription - narrowed to the free set.
     */
    fun availableSlugs(completedDays: Int, entitled: Boolean): List<String> =
        exercises.values
            .filter { it.unlockAfterDays <= completedDays }
            .filter { entitled || it.slug in freeSlugs }
            .sortedBy { it.sortOrder }
            .map { it.slug }
}
