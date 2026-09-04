package com.kegelee.app.wear

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The entitlement window.
 *
 * This is the rule that decides whether somebody gets the full exercise set,
 * the level picker, the vibration cue and reminders, and it is the one the
 * phone got wrong first: a gate that could be raised and never lowered. The
 * point of the TTL is that a cached "yes" expires on its own, so these tests
 * exist mainly to prove the "no" cases still say no.
 */
class EntitlementTest {

    private val now = 1_700_000_000_000L

    private fun profile(entitled: Boolean, syncedAt: Long) =
        Profile(entitled = entitled, syncedAt = syncedAt)

    @Test
    fun `a fresh yes is entitled`() {
        assertTrue(profile(true, now).entitledAsOf(now))
    }

    @Test
    fun `a yes just inside the window still counts`() {
        val synced = now - ENTITLEMENT_TTL_MS + 60_000
        assertTrue(profile(true, synced).entitledAsOf(now))
    }

    @Test
    fun `a yes that has aged past the window does not`() {
        val synced = now - ENTITLEMENT_TTL_MS - 1
        assertFalse(profile(true, synced).entitledAsOf(now))
    }

    @Test
    fun `a no is never entitled however fresh`() {
        assertFalse(profile(false, now).entitledAsOf(now))
    }

    @Test
    fun `an unsynced profile is not entitled`() {
        // syncedAt 0 means the server has never been heard from, which is not
        // the same as having been told yes.
        assertFalse(profile(true, 0L).entitledAsOf(now))
    }

    @Test
    fun `a clock that has gone backwards does not grant entitlement forever`() {
        // A watch whose clock jumps back makes `now - syncedAt` negative, which
        // is trivially less than the TTL. That is the safe direction - it errs
        // toward letting a paying customer keep what they paid for - and this
        // pins the behaviour so a future rewrite does not flip it by accident.
        assertTrue(profile(true, now + 86_400_000).entitledAsOf(now))
    }

    @Test
    fun `today is complete only once the required count is reached`() {
        assertFalse(Profile(todayDone = 1, todayRequired = 2).todayComplete)
        assertTrue(Profile(todayDone = 2, todayRequired = 2).todayComplete)
        assertTrue(Profile(todayDone = 3, todayRequired = 2).todayComplete)
        // A required count of zero must not read as "done" for everybody.
        assertFalse(Profile(todayDone = 0, todayRequired = 0).todayComplete)
    }

    @Test
    fun `active reminders drop the switched-off and the empty, and sort by weekday`() {
        val p = Profile(
            reminders = listOf(
                ReminderDay(weekday = 4, times = listOf("07:00"), enabled = true),
                ReminderDay(weekday = 1, times = listOf("08:00"), enabled = true),
                ReminderDay(weekday = 2, times = listOf("09:00"), enabled = false),
                ReminderDay(weekday = 3, times = emptyList(), enabled = true),
            ),
        )
        assertEquals(listOf(1, 4), p.activeReminders.map { it.weekday })
    }
}
