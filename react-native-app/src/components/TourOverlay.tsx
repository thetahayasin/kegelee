import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Animated,
  Easing,
  useWindowDimensions,
  AccessibilityInfo,
  BackHandler,
  type View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TouchableOpacity } from './Touchable';
import { TYPE, SPACE, RADIUS, Palette } from '../theme/colors';
import { useThemedStyles } from '../theme/ThemeContext';

/**
 * A guided tour that dims the screen and cuts a hole around one real element.
 *
 * The hole is FOUR RECTANGLES, not an SVG mask. A mask is the obvious tool and
 * the wrong one here: react-native-svg's mask support is the flakiest corner
 * of the library on Android, this app has already been taken down once by a
 * rendering trick that worked in development, and the entire visual payoff is
 * "a dark shape with a gap in it" - which four opaque views produce exactly,
 * on every device, forever. The rounded highlight sitting on the target is a
 * plain bordered View for the same reason.
 *
 * Targets are measured, never hardcoded. A tour written against fixed
 * coordinates is wrong on the first phone with a different screen, and this
 * app ships to everything from a small Android to a tablet.
 */

export interface TourStep {
  /** Matches a key in `targets`. */
  id: string;
  titleKey: string;
  bodyKey: string;
}

interface Props {
  visible: boolean;
  steps: TourStep[];
  /** Refs to the real elements on screen, keyed by step id. */
  targets: Record<string, React.RefObject<RNView | null>>;
  /** Called on finish AND on skip - both mean "do not show this again". */
  /**
   * Ends the tour. `completed` is true only when the reader reached the last
   * card - Skip and the Android back gesture both pass false.
   *
   * The distinction is the entire question about a tour. Whether it was read
   * or dismissed on the first card decides whether it is worth keeping, and
   * the "seen" flag cannot tell you: it records only that we stopped asking.
   */
  onDone: (completed: boolean) => void;
  /**
   * Called as each step becomes current, BEFORE its target is measured.
   *
   * Exists so a screen can bring the target into view first. Three of these
   * tours end on something below the fold - the exercise grid, the settings
   * list, the month calendar - and a spotlight is measured in window
   * coordinates, so pointing at an element that is scrolled off the screen
   * draws the highlight into empty space outside it.
   *
   * The screen does the scrolling rather than this component because the
   * screen is the only thing that knows its own layout; all this needs to
   * know is to wait afterwards.
   */
  onStep?: (stepId: string) => void;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Breathing room between the target and the edge of the cutout. */
const PAD = 8;
/** Gap between the cutout and the card. */
const GAP = 14;
/** Card never touches the screen edge. */
const MARGIN = SPACE.lg;
/**
 * How long a scroll-into-view is given to finish before measuring.
 *
 * React Native's animated scrollTo has no completion callback, so this is a
 * wait rather than a signal. Generous on purpose: measuring early puts the
 * spotlight where the target WAS, which is worse than a moment of dim.
 */
const SCROLL_SETTLE_MS = 380;

/** Enough room below the target to put the card there rather than above. */
/**
 * Only a first guess, used for the very first frame before the card has been
 * laid out. Everything after that uses the MEASURED height.
 *
 * It used to be the only number in play, and the card was positioned straight
 * from it with no clamp: `{ top: hole.y + hole.height + GAP }` and nothing
 * checking that 190 was anywhere near the truth. It is not - a two line title
 * with a three line body in German is well past 260 - so the card ran off the
 * bottom of the screen and took its Continue button with it.
 */
const CARD_ESTIMATE = 190;

/**
 * The least room a card can be given and still be worth reading.
 *
 * Below this the card would be a sliver with two lines showing and everything
 * else behind a scroll, which is worse than not pointing at all.
 */
const MIN_CARD_H = 150;


export const TourOverlay: React.FC<Props> = ({ visible, steps, targets, onDone, onStep }) => {
  const styles = useThemedStyles(makeStyles);
  const { t } = useTranslation();
  // Live, not captured at import. Read once at module scope these were stale
  // after any rotation or on a foldable being unfolded - and every rectangle
  // on this overlay is computed from them, so the dim would have covered the
  // wrong area and the card would have been placed off-screen.
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  // The card is placed in window coordinates, so it has to know where the
  // status bar and the navigation bar are or it will happily sit under one.
  const insets = useSafeAreaInsets();

  /**
   * Targets through a ref, not straight from the prop.
   *
   * Callers write `targets={{ ring: ref, ... }}` inline, which is a new object
   * on every render of the host screen - and the host screens here re-render
   * constantly, one of them on a timer. As an effect dependency that object
   * re-triggers a measure pass on every one of those renders. Held in a ref
   * the effect depends only on things that actually change the answer.
   */
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  // The card's real height, once it has been laid out.
  const [cardH, setCardH] = useState(CARD_ESTIMATE);

  /**
   * Where this Modal's top-left sits in window coordinates.
   *
   * Targets are measured with measureInWindow, which reports positions in the
   * APP WINDOW. This Modal is statusBarTranslucent, so it draws from the top
   * of the SCREEN. Those are the same point only when the app is running edge
   * to edge - true on Android 15+, where the platform enforces it, and false
   * below, where the window starts beneath the status bar. On those devices
   * every spotlight was out by the status bar height, always in the same
   * direction, which is what "the highlight area is off" looks like.
   *
   * Rather than branch on an OS version or add a status bar height that may
   * not apply, the offset is MEASURED: a zero-size probe pinned to this
   * Modal's top-left, read back in the same coordinate system as the targets.
   * Whatever the difference turns out to be, subtracting it is correct.
   */
  const originRef = useRef<RNView>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const fade = useRef(new Animated.Value(0)).current;
  /**
   * The cross-fade between steps.
   *
   * Without it the tour visibly pointed at the wrong thing. `rect` is measured
   * in an effect that waits up to SCROLL_SETTLE_MS for the host screen to
   * scroll the next target into view - but the step, and therefore the card's
   * text, changed immediately. For those 380ms the spotlight sat on the
   * PREVIOUS element while the card described the next one, and then both
   * jumped. Now the content fades out, the measurement happens behind it, and
   * it fades back in already in the right place.
   */
  const stepFade = useRef(new Animated.Value(1)).current;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const step = steps[index];

  /**
   * Measure the current target.
   *
   * Deferred a frame because a tour usually starts in the same commit that
   * mounts the thing it points at, and measuring an unlaid-out view returns
   * zeros. A target that cannot be measured leaves `rect` null, which renders
   * a plain centred card rather than a spotlight on the wrong part of the
   * screen - the tour still explains itself, it just stops pointing.
   */
  useEffect(() => {
    if (!visible || !step) return;
    let cancelled = false;

    // Nothing from the previous step survives into this one. Holding the old
    // rect is what put the spotlight on the wrong element while the new card
    // was already on screen.
    setRect(null);
    stepFade.setValue(0);

    // Let the screen bring the target into view first, then wait for the
    // scroll to land. Without a host that scrolls this is a single frame,
    // which is only enough for layout to settle.
    const hasScroller = !!onStepRef.current;
    onStepRef.current?.(step.id);

    const reveal = () =>
      Animated.timing(stepFade, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();

    const measure = () => {
      const node = targetsRef.current[step.id]?.current;
      if (!node) {
        if (!cancelled && mountedRef.current) {
          setRect(null);
          reveal();
        }
        return;
      }
      // The probe first, so the target is converted using an origin read in
      // the same layout pass.
      originRef.current?.measureInWindow((ox, oy) => {
        if (cancelled || !mountedRef.current) return;
        setOrigin((prev) =>
          Math.abs(prev.x - ox) > 0.5 || Math.abs(prev.y - oy) > 0.5
            ? { x: ox, y: oy }
            : prev,
        );
      });
      node.measureInWindow((x, y, width, height) => {
        if (cancelled || !mountedRef.current) return;
        setRect(width > 0 && height > 0 ? { x, y, width, height } : null);
        reveal();
      });
    };

    let frame = 0;
    const timer = setTimeout(
      () => {
        frame = requestAnimationFrame(measure);
      },
      hasScroller ? SCROLL_SETTLE_MS : 0,
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [visible, step, index, stepFade]);

  useEffect(() => {
    if (!visible) return;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (!mountedRef.current) return;
        if (reduced) {
          fade.setValue(1);
          return;
        }
        Animated.timing(fade, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
  }, [visible, fade]);

  const finish = useCallback(
    (completed: boolean) => {
      setIndex(0);
      onDone(completed);
    },
    [onDone],
  );

  const next = useCallback(() => {
    if (index >= steps.length - 1) {
      finish(true);
      return;
    }
    setIndex((i) => i + 1);
  }, [index, steps.length, finish]);

  // Android back ends the tour rather than closing the screen underneath it.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish(false);
      return true;
    });
    return () => sub.remove();
  }, [visible, finish]);

  if (!visible || !step) return null;

  // Cutout, padded, clamped to the screen so a target at the very edge cannot
  // produce a negative-width dim rectangle.
  // Clamped on BOTH edges. Capping only the width let a target near the
    // right of the screen produce x + width past the screen, which makes the
    // trailing dim rectangle negative-width and leaves an undimmed strip.
  const hole = rect
    ? (() => {
        // Out of window space, into this Modal's space.
        const x = Math.max(0, rect.x - origin.x - PAD);
        const y = Math.max(0, rect.y - origin.y - PAD);


        /**
         * The WHOLE target, always.
         *
         * It used to be clipped so the card had somewhere to stand, and on the
         * schedule tab that lit the month calendar down to about half its
         * height and dimmed the rest - which reads as the calendar being cut
         * in two, not as the calendar being pointed at.
         *
         * Where a target is genuinely too tall to sit beside, the card now
         * overlaps its far end instead (see the placement below). Covering the
         * bottom of something is a far smaller lie than slicing it: the part
         * being described stays whole and stays visible.
         */
        return {
          x,
          y,
          width: Math.max(0, Math.min(rect.width + PAD * 2, SCREEN_W - x)),
          height: Math.max(0, Math.min(rect.height + PAD * 2, SCREEN_H - y)),
        };
      })()
    : null;

  // Where the card goes.
  //
  // The one rule: it must never sit on top of the thing it is describing.
  // The previous version fell back to CENTRING the card when neither side had
  // room for it, which put it squarely over the element it had just cut a hole
  // for - the spotlight pointing at something the card was covering.
  //
  // So a side is always chosen, the card is capped to that side's room, and it
  // scrolls internally if the copy is longer than the room allows. It is only
  // when NEITHER side can hold a usable card that the tour gives up pointing
  // altogether and shows the card centred on a plain dim - which is honest:
  // if there is nowhere to stand that is not on top of the target, better to
  // stop pointing than to point at something you are hiding.
  const topLimit = insets.top + MARGIN;
  const bottomLimit = SCREEN_H - insets.bottom - MARGIN;
  const available = Math.max(MIN_CARD_H, bottomLimit - topLimit);

  const roomBelow = hole ? Math.max(0, bottomLimit - (hole.y + hole.height + GAP)) : 0;
  const roomAbove = hole ? Math.max(0, hole.y - GAP - topLimit) : 0;
  // The spotlight is always drawn now; what varies is whether the card can
  // stand clear of it.
  const canPoint = !!hole;
  const fitsBeside = Math.max(roomBelow, roomAbove) >= MIN_CARD_H;

  let cardTop: number;
  let cardMax: number;
  if (!hole) {
    cardMax = available;
    cardTop = topLimit + (available - Math.min(cardH, available)) / 2;
  } else if (!fitsBeside) {
    // Nowhere to stand beside a target this tall. Sit at the bottom, over its
    // far end - the top of it, which is where the eye goes, stays clear.
    cardMax = available;
    cardTop = bottomLimit - Math.min(cardH, available);
  } else {
    // Prefer below - reading downward from the thing you just looked at is the
    // natural order - but only when it genuinely fits. Otherwise whichever
    // side has more room.
    const placeBelow = cardH <= roomBelow || (cardH > roomAbove && roomBelow >= roomAbove);
    cardMax = placeBelow ? roomBelow : roomAbove;
    const h = Math.min(cardH, cardMax);
    cardTop = placeBelow ? hole.y + hole.height + GAP : hole.y - GAP - h;
  }
  cardTop = Math.max(topLimit, Math.min(cardTop, bottomLimit - Math.min(cardH, cardMax)));

  const cardStyle = { top: cardTop, maxHeight: cardMax };

  const isLast = index === steps.length - 1;

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={() => finish(false)}>
      <Animated.View
        style={[styles.root, { opacity: Animated.multiply(fade, stepFade) }]}
        accessibilityViewIsModal
      >
        {/* The origin probe. Zero-size, drawn nowhere, measured for its
            position only - see the note on `origin`. */}
        <View ref={originRef} style={styles.origin} pointerEvents="none" />
        {/* The dim, as four opaque rectangles around the hole. Tapping any of
            them advances, which is what people try first.

            All four are hidden from accessibility: they are one affordance
            split into four views for drawing reasons, and a screen reader
            announcing four unlabelled buttons around the thing it is meant to
            be describing is worse than silence. The card below carries the
            real controls. */}
        {canPoint && hole ? (
          <>
            <TouchableOpacity
              activeOpacity={1}
              onPress={next}
              importantForAccessibility="no"
              accessibilityElementsHidden
              style={[styles.dim, { top: 0, left: 0, right: 0, height: hole.y }]}
            />
            <TouchableOpacity
              activeOpacity={1}
              onPress={next}
              importantForAccessibility="no"
              accessibilityElementsHidden
              style={[
                styles.dim,
                { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 },
              ]}
            />
            <TouchableOpacity
              activeOpacity={1}
              onPress={next}
              importantForAccessibility="no"
              accessibilityElementsHidden
              style={[styles.dim, { top: hole.y, left: 0, width: hole.x, height: hole.height }]}
            />
            <TouchableOpacity
              activeOpacity={1}
              onPress={next}
              importantForAccessibility="no"
              accessibilityElementsHidden
              style={[
                styles.dim,
                {
                  top: hole.y,
                  left: hole.x + hole.width,
                  right: 0,
                  height: hole.height,
                },
              ]}
            />
            {/* No ring.
                There was an accent border drawn around the cutout, and it was
                doing the one job the cutout already does. Worse, a rectangle
                traced around a real element almost never agrees with that
                element's own shape - a card has its own radius, a row has
                none, an icon is round - so the border sat slightly wrong on
                nearly everything it framed, and on a clipped target it drew an
                edge across content that carries on past it.
                The hole in the dim is the highlight. It is unambiguous, it fits
                whatever is underneath it exactly, and it needs no decoration. */}

            {/* The hole advances too.
                Tapping the dim moved the tour on; tapping the one thing the
                tour was pointing AT did nothing at all - which is the first
                thing a reader tries, because the card has just spent a
                sentence drawing their eye to it. The element underneath is
                not reachable through the overlay anyway (the modal sits on
                top of it), so this is not swallowing a real press; it is
                giving the most obvious target the same behaviour as the rest
                of the screen. Hidden from assistive tech for the same reason
                the four dim panels are: the card below carries the controls. */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={next}
              importantForAccessibility="no"
              accessibilityElementsHidden
              style={[
                styles.spotlightTap,
                {
                  top: hole.y,
                  left: hole.x,
                  width: hole.width,
                  height: hole.height,
                },
              ]}
            />
          </>
        ) : (
          <TouchableOpacity
            activeOpacity={1}
            onPress={next}
            importantForAccessibility="no"
            accessibilityElementsHidden
            style={StyleSheet.absoluteFill}
          >
            <View style={styles.dimFull} />
          </TouchableOpacity>
        )}

        <View
          style={[styles.card, cardStyle]}
          accessibilityLiveRegion="polite"
          onLayout={(e) => {
            // Round, so a sub-pixel layout cannot oscillate between two values
            // and re-render the overlay on every frame.
            const next = Math.round(e.nativeEvent.layout.height);
            setCardH((prev) => (Math.abs(prev - next) > 1 ? next : prev));
          }}
        >
          {/* The copy scrolls; the footer does not.
              A long translation must never be able to push Continue out of
              the card, so the two are separated: the text takes whatever room
              is left after the controls have had theirs. */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollInner}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.title}>{t(step.titleKey)}</Text>
            <Text style={styles.body}>{t(step.bodyKey)}</Text>
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.dots}>
              {steps.map((s, i) => (
                <View key={s.id} style={[styles.dot, i === index && styles.dotOn]} />
              ))}
            </View>

            <View style={styles.actions}>
              {/* Available on every step but the last, where Skip and
                  Continue would do exactly the same thing - two buttons for
                  one outcome is a choice that is not a choice. */}
              {!isLast && (
                <TouchableOpacity
                  style={styles.skipBtn}
                  onPress={() => finish(false)}
                  accessibilityRole="button"
                >
                  <Text style={styles.skipText}>{t('quiz.skip')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.nextBtn}
                onPress={next}
                accessibilityRole="button"
              >
                <Text style={styles.nextText} numberOfLines={1} adjustsFontSizeToFit>
                  {t('progress.continue')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
};

/**
 * Deliberately NOT a palette token, and deliberately the same in both
 * appearances.
 *
 * A spotlight works by removing everything except the one element it is
 * pointing at, so the dim is the absence of the page rather than a colour the
 * page is wearing. Lightening it for the light palette would weaken exactly
 * the thing it exists to do - and the hole cut in it shows the real screen in
 * whichever appearance is live, so the contrast lands either way.
 */
const DIM = 'rgba(3,5,10,0.86)';

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  root: { flex: 1 },
  dim: { position: 'absolute', backgroundColor: DIM },
  /** The hole itself, made tappable. Its geometry is supplied inline. */
  spotlightTap: { position: 'absolute' },
  dimFull: { flex: 1, backgroundColor: DIM },
  origin: { position: 'absolute', top: 0, left: 0, width: 0, height: 0 },
  card: {
    position: 'absolute',
    start: MARGIN,
    end: MARGIN,
    // Never taller than the room it was given. Without this the maxHeight in
    // cardStyle would be advisory only, because the content sets the height.
    overflow: 'hidden',
    ...COLORS.glass,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface3,
    borderRadius: RADIUS.lg,
    padding: SPACE.xl,
    gap: SPACE.sm,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollInner: { gap: SPACE.sm },
  title: { ...TYPE.heading, color: COLORS.white },
  body: { ...TYPE.bodySm, color: COLORS.textMuted, lineHeight: 20 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACE.md,
    marginTop: SPACE.md,
  },
  dots: { flexDirection: 'row', gap: SPACE.xs, flexShrink: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.border },
  dotOn: { backgroundColor: COLORS.accentText, width: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  skipBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: SPACE.md },
  skipText: { ...TYPE.bodySm, fontWeight: '600', color: COLORS.textMuted },
  nextBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACE.xl,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
  },
  nextText: { ...TYPE.bodySm, fontWeight: '700', color: COLORS.onAccent },
});
