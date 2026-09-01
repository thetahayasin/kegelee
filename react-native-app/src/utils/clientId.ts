/**
 * A stable id for a row the device created, used to deduplicate it on the
 * server no matter how many times it is pushed.
 *
 * Generated when the row is WRITTEN, never when it is sent. That distinction
 * is the whole point: a push that succeeds on the server and loses its reply
 * gets retried, and only an id fixed at creation time lets the server
 * recognise the retry as the same row. An id made at send time is a new id
 * every attempt, which is no id at all.
 *
 * Not a UUID, and deliberately no dependency for one. These are scoped to a
 * single user by a unique index on (user_id, client_id), and the combination
 * of a millisecond timestamp with 64 bits of randomness makes a collision
 * inside one account something that will not happen.
 */
export const newClientId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
