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
 *
 * `at` defaults to now. It exists because several screens need the local date
 * of a MOMENT rather than of this instant: the Progress tab labels a session
 * "Today" and buckets months of history, and doing either from the device
 * clock reintroduces exactly the drift this module was written to remove for
 * a reader whose timezone is not the phone's.
 */
export const getLocalDateString = (timezone?: string | null, at?: Date): string => {
  const when = at ?? new Date();
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(when);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  } catch {
    // Intl with a timeZone can throw on a Hermes build without full ICU data.
    // Falling back to the device clock is the same behaviour as before.
    const year = when.getFullYear();
    const month = String(when.getMonth() + 1).padStart(2, '0');
    const day = String(when.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

/**
 * A subscription date as the reader's own locale writes it.
 *
 * Lived inside SettingsScreen, which was fine while Settings was the only
 * place that showed one. The home screen now states a trial's end date and a
 * cancelled subscription's last day too, and two copies of a date format are
 * two chances for the same date to be written two ways in one app.
 *
 * Empty string for anything unparseable, so a caller can treat "no date" and
 * "bad date" identically - both mean: say the thing without the date.
 */
export const formatSubscriptionDate = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
