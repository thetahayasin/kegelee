package com.kegelee.app.wear

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * The streak walk.
 *
 * The API sends no streak field - the phone derives it from the same training
 * rows - so this is real arithmetic rather than a passthrough, and it used to
 * step backwards in fixed 24-hour jumps. That is wrong twice a year: a
 * clocks-back day is 25 hours long, so the cursor landed inside the same local
 * date twice and counted one day of training as two.
 *
 * These tests build their payload from real calendar days relative to now, so
 * they exercise whatever the current timezone actually does.
 */
class StreakTest {

    private val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    /** A date `back` calendar days before today, in local time. */
    private fun daysAgo(back: Int): String =
        fmt.format(
            Calendar.getInstance().apply { add(Calendar.DAY_OF_YEAR, -back) }.time,
        )

    /** The pull payload shape, with one row per completed day. */
    private fun payload(vararg completedDaysAgo: Int, openDaysAgo: List<Int> = emptyList()): JsonObject {
        val rows = completedDaysAgo.joinToString(",") {
            """{"date":"${daysAgo(it)}","completed_at":"${daysAgo(it)}T10:00:00Z"}"""
        }
        val open = openDaysAgo.joinToString(",") {
            """{"date":"${daysAgo(it)}","completed_at":null}"""
        }
        val all = listOf(rows, open).filter { it.isNotBlank() }.joinToString(",")
        return Json.parseToJsonElement("""{"training_days":[$all]}""") as JsonObject
    }

    @Test
    fun `no rows is no streak`() {
        assertEquals(0, Repo.streakFrom(Json.parseToJsonElement("{}") as JsonObject))
        assertEquals(0, Repo.streakFrom(payload()))
    }

    @Test
    fun `today alone is a streak of one`() {
        assertEquals(1, Repo.streakFrom(payload(0)))
    }

    @Test
    fun `consecutive days ending today count through`() {
        assertEquals(4, Repo.streakFrom(payload(0, 1, 2, 3)))
    }

    @Test
    fun `an unfinished today does not break yesterday's streak`() {
        // Today being open has simply not been ADDED to the streak yet, which is
        // why the walk starts at yesterday when today is not closed.
        assertEquals(3, Repo.streakFrom(payload(1, 2, 3, openDaysAgo = listOf(0))))
    }

    @Test
    fun `a gap ends the streak`() {
        // Today, yesterday, then nothing on the day before: stops at two.
        assertEquals(2, Repo.streakFrom(payload(0, 1, 3, 4, 5)))
    }

    @Test
    fun `training a week ago with nothing since is not a live streak`() {
        assertEquals(0, Repo.streakFrom(payload(6, 7, 8)))
    }

    @Test
    fun `a row with no completed_at never counts`() {
        assertEquals(0, Repo.streakFrom(payload(openDaysAgo = listOf(0, 1, 2))))
    }

    @Test
    fun `a long run is counted in full`() {
        // Also the case that a fixed-24-hour walk would drift on: 60 days is
        // long enough to cross a DST boundary in most timezones.
        assertEquals(60, Repo.streakFrom(payload(*(0 until 60).toList().toIntArray())))
    }
}
