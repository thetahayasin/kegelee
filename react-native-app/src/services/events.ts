import { getDBConnection } from '../db/sqlite';

/**
 * What the reader did, queued for the next sync.
 *
 * The app already records what someone HAS - days completed, a level, a
 * subscription. None of that answers the questions that keep coming up: did
 * they finish the quiz or bail at question two, did the tour help or get
 * dismissed on the first card, which padlock were they pressing when they went
 * to the paywall.
 *
 * Written to SQLite rather than fired at the network, for the same reason
 * every other write in this app is: most of a session happens with the phone
 * in a pocket, and an event that needs a connection at the moment it happens
 * is an event you only ever collect from people on wifi.
 *
 * Deliberately small. Ten named events, one optional subject, and a bag of
 * meta nobody queries. This is a log to read, not an analytics product.
 */

/** The closed vocabulary. Must match UserEvent::NAMES on the server. */
export type EventName =
  | 'quiz_completed'
  | 'quiz_skipped'
  | 'tour_completed'
  | 'tour_skipped'
  | 'lesson_completed'
  | 'lock_tapped'
  | 'paywall_viewed'
  | 'reminders_set'
  | 'measurement_taken'
  | 'appearance_changed';

/**
 * A client-side id, so a retried push cannot record the same thing twice.
 *
 * Not a real uuid v4 - there is no crypto source wired up here and this does
 * not need to be unguessable, only unique within one account. Time plus two
 * random blocks is comfortably enough for that.
 */
const newClientId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

/**
 * Record one event.
 *
 * Never throws and never blocks the caller: this is instrumentation, and an
 * instrument that can break the thing it is measuring is worse than no
 * instrument. Every call site fires and forgets.
 */
export const track = async (
  userId: number | null | undefined,
  name: EventName,
  subject?: string | null,
  meta?: Record<string, unknown> | null,
): Promise<void> => {
  // A guest has nowhere to file this. Their behaviour before signing up is
  // genuinely interesting, but attributing it needs an account to attribute
  // it TO, and inventing a device id to reconcile later is a bigger system
  // than this is meant to be.
  if (!userId) return;

  try {
    const db = await getDBConnection();
    await db.executeSql(
      `INSERT INTO user_events (client_id, user_id, name, subject, meta, occurred_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [
        newClientId(),
        userId,
        name,
        subject ?? null,
        meta ? JSON.stringify(meta) : null,
        new Date().toISOString(),
      ],
    );
  } catch {
    // Swallowed on purpose. See above.
  }
};

export interface OutboxEvent {
  id: number;
  client_id: string;
  name: EventName;
  subject: string | null;
  meta: string | null;
  occurred_at: string;
}

/**
 * The queue, oldest first.
 *
 * Capped. A device that has been offline for a month, or one where a sync has
 * been failing quietly, should not eventually try to post ten thousand rows in
 * one request and fail forever on the size of it.
 */
export const getUnsyncedEvents = async (userId: number): Promise<OutboxEvent[]> => {
  try {
    const db = await getDBConnection();
    const res = await db.executeSql(
      `SELECT id, client_id, name, subject, meta, occurred_at
         FROM user_events
        WHERE user_id = ? AND synced = 0
        ORDER BY occurred_at ASC
        LIMIT 200`,
      [userId],
    );
    const out: OutboxEvent[] = [];
    for (let i = 0; i < res[0].rows.length; i++) out.push(res[0].rows.item(i));
    return out;
  } catch {
    return [];
  }
};

/**
 * Mark as sent, then drop what has been sent and is old.
 *
 * Kept briefly rather than deleted on the spot so that a push which the server
 * accepted but whose response never arrived does not lose the events - the
 * next sync re-sends them, and the server's (user_id, client_id) uniqueness
 * makes that harmless.
 */
export const markEventsSynced = async (ids: number[]): Promise<void> => {
  if (ids.length === 0) return;
  try {
    const db = await getDBConnection();
    const holes = ids.map(() => '?').join(',');
    await db.executeSql(
      `UPDATE user_events SET synced = 1 WHERE id IN (${holes})`,
      ids,
    );
    await db.executeSql(
      `DELETE FROM user_events
        WHERE synced = 1 AND occurred_at < datetime('now', '-7 days')`,
    );
  } catch {}
};
