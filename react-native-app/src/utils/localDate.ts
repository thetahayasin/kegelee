/**
 * Today's date as YYYY-MM-DD in a given IANA timezone.
 *
 * This lives in its own dependency-free module because BOTH the write path
 * (recording a session in db/queries) and every read path (progression, the
 * Progress tab) must agree on what "today" is. They previously did not:
 * recordCompletedSession built the date from the device clock while everything
 * that read it used the user's stored timezone, so a device in a different zone
 * wrote the session to one training_days row and looked for it in another. The
 * day then never showed as complete. Keeping one implementation here, rather
 * than importing across services/db (which would be a cycle), is what stops
 * that drifting apart again.
 */
export const getLocalDateString = (timezone?: string | null): string => {
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  } catch {
    // Intl with a timeZone can throw on a Hermes build without full ICU data.
    // Falling back to the device clock is the same behaviour as before.
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};
