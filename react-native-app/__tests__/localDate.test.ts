/**
 * @format
 *
 * getLocalDateString decides what "today" means for the whole app: which
 * training_days row a session is written to, whether the day ring shows as
 * complete, which bar a measurement lands in on the Progress chart, and
 * whether the last measurement is labelled "Today".
 *
 * All of those are wrong by exactly one day for anyone whose stored timezone
 * differs from the device's, for a few hours out of every twenty-four - a
 * window nobody sits in on purpose. The `at` parameter is new, and it is the
 * one the Progress tab needs to ask about a MOMENT rather than about now.
 */
import { getLocalDateString, formatSubscriptionDate } from '../src/utils/localDate';

describe('getLocalDateString', () => {
  it('reads the date in the given timezone, not the device one', () => {
    // 22:30 UTC is already the next day in Tokyo and still the same day in
    // New York. One instant, three answers.
    const at = new Date('2026-03-10T22:30:00Z');
    expect(getLocalDateString('UTC', at)).toBe('2026-03-10');
    expect(getLocalDateString('Asia/Tokyo', at)).toBe('2026-03-11');
    expect(getLocalDateString('America/New_York', at)).toBe('2026-03-10');
  });

  it('reads the previous day where the offset is negative enough', () => {
    // 02:00 UTC is still the evening before in Los Angeles.
    const at = new Date('2026-03-11T02:00:00Z');
    expect(getLocalDateString('UTC', at)).toBe('2026-03-11');
    expect(getLocalDateString('America/Los_Angeles', at)).toBe('2026-03-10');
  });

  it('pads month and day to two digits, so the strings sort', () => {
    const at = new Date('2026-01-05T12:00:00Z');
    expect(getLocalDateString('UTC', at)).toBe('2026-01-05');
  });

  it('crosses the year boundary in the right direction', () => {
    const at = new Date('2026-12-31T23:00:00Z');
    expect(getLocalDateString('UTC', at)).toBe('2026-12-31');
    expect(getLocalDateString('Asia/Tokyo', at)).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    const at = new Date('2028-02-29T12:00:00Z');
    expect(getLocalDateString('UTC', at)).toBe('2028-02-29');
  });

  describe('with no `at`', () => {
    // Fake timers, not a Date.now stub: the function calls `new Date()`.
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-03-10T22:30:00Z'));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('defaults to now, and agrees with passing that same instant', () => {
      expect(getLocalDateString('Asia/Tokyo')).toBe('2026-03-11');
      expect(getLocalDateString('Asia/Tokyo')).toBe(
        getLocalDateString('Asia/Tokyo', new Date()),
      );
    });

    it('falls back to the device clock when no timezone is given', () => {
      // null and undefined both mean "the device decides", and must not throw.
      expect(getLocalDateString(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(getLocalDateString(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it('falls back to the device clock rather than throwing on a bad timezone', () => {
    // Hermes can ship without full ICU data, and an unknown zone name throws
    // inside Intl. The date it returns is the device's, but it is a date.
    const at = new Date('2026-03-10T22:30:00Z');
    expect(getLocalDateString('Not/AZone', at)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatSubscriptionDate', () => {
  it('is empty for anything unparseable, so callers can drop the date', () => {
    expect(formatSubscriptionDate(null)).toBe('');
    expect(formatSubscriptionDate(undefined)).toBe('');
    expect(formatSubscriptionDate('')).toBe('');
    expect(formatSubscriptionDate('not a date')).toBe('');
  });

  it('renders a real date as something non-empty', () => {
    expect(formatSubscriptionDate('2026-03-10T00:00:00Z')).not.toBe('');
  });
});
