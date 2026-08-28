/**
 * @format
 *
 * levelFromQuiz decides the session length a brand-new account starts on -
 * level 1 is 60 seconds, level 5 is 300. Getting it wrong in the generous
 * direction hands someone a five-minute session on the day they could not hold
 * a contraction for three seconds, which is a plan they fail immediately.
 *
 * The rule is: the two answers set the ambition, the measured hold sets the
 * ceiling, and the ceiling wins.
 */
import { levelFromQuiz } from '../src/screens/auth/OnboardingQuiz';

describe('levelFromQuiz', () => {
  // A hold long enough not to trigger any cap, so a case can isolate points.
  const UNCAPPED = 10;

  it('maps the answer points onto levels 1 through 5', () => {
    expect(levelFromQuiz(0, UNCAPPED)).toBe(1);
    expect(levelFromQuiz(1, UNCAPPED)).toBe(2);
    expect(levelFromQuiz(2, UNCAPPED)).toBe(3);
    expect(levelFromQuiz(3, UNCAPPED)).toBe(4);
    expect(levelFromQuiz(4, UNCAPPED)).toBe(5);
  });

  it('never returns a level outside the catalogue', () => {
    // Defensive: nothing should hand it these, but a level of 0 or 9 would be
    // an undefined LEVELS lookup and a blank session.
    expect(levelFromQuiz(-5, UNCAPPED)).toBe(1);
    expect(levelFromQuiz(99, UNCAPPED)).toBe(5);
    expect(levelFromQuiz(99, 0)).toBe(5);
  });

  describe('a hold of 0 means NOT MEASURED, not measured badly', () => {
    // The quiz can be skipped, and a skipped measurement must not be read as
    // a failed one. Capping a skipper at level 2 would punish them for
    // declining to be tested, which is the opposite of what skip is for.
    it('applies no ceiling at all', () => {
      expect(levelFromQuiz(4, 0)).toBe(5);
      expect(levelFromQuiz(2, 0)).toBe(3);
    });

    it('still respects the answers, so a skipping beginner starts at 1', () => {
      expect(levelFromQuiz(0, 0)).toBe(1);
    });

    it('grants no promotion either - there is nothing to promote on', () => {
      // 0 must not fall through to the >= 15 branch by some future edit.
      expect(levelFromQuiz(1, 0)).toBe(2);
    });
  });

  it('caps at level 2 when the hold is under three seconds', () => {
    // Confident answers, but the body says otherwise. The body wins.
    expect(levelFromQuiz(4, 2.9)).toBe(2);
    expect(levelFromQuiz(2, 1)).toBe(2);
  });

  it('caps at level 3 when the hold is under six seconds', () => {
    expect(levelFromQuiz(4, 5.9)).toBe(3);
    expect(levelFromQuiz(3, 4)).toBe(3);
  });

  it('does not cap once the hold reaches six seconds', () => {
    expect(levelFromQuiz(4, 6)).toBe(5);
    expect(levelFromQuiz(3, 6)).toBe(4);
  });

  it('promotes one level for a hold of fifteen seconds or more', () => {
    expect(levelFromQuiz(0, 15)).toBe(2);
    expect(levelFromQuiz(2, 20)).toBe(4);
  });

  it('does not promote past the top level', () => {
    expect(levelFromQuiz(4, 60)).toBe(5);
  });

  it('lets a strong hold lift a complete beginner, but only by one', () => {
    // Never trained, only a couple of minutes a day, but holds 18 seconds.
    // Worth more than level 1; not worth five-minute sessions.
    expect(levelFromQuiz(0, 18)).toBe(2);
  });

  it('keeps an experienced answer honest when the hold is weak', () => {
    // Trains regularly, ten minutes a day, holds 2 seconds. The answers say
    // level 5 and the measurement says otherwise.
    expect(levelFromQuiz(4, 2)).toBe(2);
  });

  it('treats the smallest real hold as measured, unlike 0', () => {
    // The screen refuses anything under MIN_HOLD_S, so the lowest value that
    // can actually reach here is 1 - and it IS a measurement, so it caps.
    expect(levelFromQuiz(4, 1)).toBe(2);
    expect(levelFromQuiz(4, 0)).toBe(5);
  });
});
