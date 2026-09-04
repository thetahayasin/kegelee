package com.kegelee.app.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

/**
 * The weekday conversion, which is the trap this file exists for.
 *
 * The backend counts weekdays Monday-first (0 = Mon) and `Calendar` counts them
 * Sunday-first (1 = Sun). Getting it wrong shows Monday's reminder on a
 * Tuesday, and it fails quietly - nothing crashes, the alarm just lands on the
 * wrong day, which is the sort of thing nobody reports and everybody notices.
 */
class ReminderScheduleTest {

    private fun at(year: Int, month: Int, day: Int, hour: Int, minute: Int): Long =
        Calendar.getInstance(TimeZone.getDefault()).apply {
            clear()
            set(year, month - 1, day, hour, minute, 0)
        }.timeInMillis

    private fun weekdayOf(ms: Long): Int =
        Calendar.getInstance().apply { timeInMillis = ms }.get(Calendar.DAY_OF_WEEK)

    /** 2024-01-01 was a Monday, which makes the arithmetic checkable by hand. */
    private val mondayNoon = at(2024, 1, 1, 12, 0)

    @Test
    fun `each backend weekday maps to the right calendar day`() {
        val expected = listOf(
            0 to Calendar.MONDAY,
            1 to Calendar.TUESDAY,
            2 to Calendar.WEDNESDAY,
            3 to Calendar.THURSDAY,
            4 to Calendar.FRIDAY,
            5 to Calendar.SATURDAY,
            6 to Calendar.SUNDAY,
        )
        for ((backend, calendarDay) in expected) {
            val next = Reminders.nextOccurrence(backend, "09:00", mondayNoon)!!
            assertEquals("backend weekday $backend", calendarDay, weekdayOf(next))
        }
    }

    @Test
    fun `a slot later today is today, not next week`() {
        val next = Reminders.nextOccurrence(0, "20:00", mondayNoon)!!
        assertEquals(Calendar.MONDAY, weekdayOf(next))
        assertEquals(at(2024, 1, 1, 20, 0), next)
    }

    @Test
    fun `a slot that has already passed today rolls to next week`() {
        val next = Reminders.nextOccurrence(0, "08:00", mondayNoon)!!
        assertEquals(Calendar.MONDAY, weekdayOf(next))
        assertEquals(at(2024, 1, 8, 8, 0), next)
    }

    @Test
    fun `every occurrence is in the future and inside a week`() {
        for (weekday in 0..6) {
            val next = Reminders.nextOccurrence(weekday, "09:00", mondayNoon)!!
            assertTrue("weekday $weekday is in the past", next > mondayNoon)
            assertTrue("weekday $weekday is over a week out", next - mondayNoon <= 8L * 86_400_000)
        }
    }

    @Test
    fun `a malformed time is skipped rather than guessed at`() {
        assertNull(Reminders.nextOccurrence(0, "", mondayNoon))
        assertNull(Reminders.nextOccurrence(0, "0900", mondayNoon))
        assertNull(Reminders.nextOccurrence(0, "ab:cd", mondayNoon))
    }
}
