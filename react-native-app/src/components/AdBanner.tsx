import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AD_UNITS } from '../constants/ads';
import { setBannerHeight, useAdsReady } from '../services/ads';

/** First retry after a failed load, doubling up to the cap. */
const RETRY_FIRST_MS = 30 * 1000;
const RETRY_MAX_MS = 5 * 60 * 1000;

/**
 * The one banner: an anchored adaptive strip under the floating tab bar.
 *
 * Only ever mounted by the tab navigator, so it is on screen for the four tabs
 * and nowhere else. A workout, its completion screen and the lessons are
 * pushed OVER the tabs and cover it - nobody gets an ad while they are
 * counting contractions.
 *
 * Two library behaviours this is built around, both of which once left the
 * tab bar dead to taps:
 *
 *   - `onSizeChange` fires as soon as the size prop is set, BEFORE any ad has
 *     loaded. Taking it as "there is an ad" lifted the tab bar over an empty
 *     strip. Only `onAdLoaded` claims space here.
 *   - After a failed load the library never shrinks its native view back: it
 *     stays full banner size, transparent, and catches every touch under it -
 *     which, once the bar had dropped back down, was the tab bar. So a failed
 *     banner is UNMOUNTED, and the dock is clipped to the loaded height, so
 *     the native view has no area to catch touches in until an ad is showing.
 *
 * A failure is retried by remounting, with backoff: new ad units and new
 * accounts get little fill for their first days, and offline is normal here.
 */
export const AdBanner: React.FC = () => {
  const adsReady = useAdsReady();
  const [height, setHeight] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const retryMs = useRef(RETRY_FIRST_MS);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBannerHeight(height);
  }, [height]);

  // Leaving the tabs (sign-out, the basics gate) must give the space back.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      setBannerHeight(0);
    },
    [],
  );

  if (!adsReady || !AD_UNITS.banner || waiting) return null;

  const onFailed = () => {
    setHeight(0);
    setWaiting(true);
    const delay = retryMs.current;
    retryMs.current = Math.min(retryMs.current * 2, RETRY_MAX_MS);
    timer.current = setTimeout(() => {
      setWaiting(false);
      setAttempt((n) => n + 1);
    }, delay);
  };

  return (
    <View style={[styles.wrap, { height }]} pointerEvents="box-none">
      <BannerAd
        key={attempt}
        unitId={AD_UNITS.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={({ height: h }) => {
          retryMs.current = RETRY_FIRST_MS;
          setHeight(Math.round(h));
        }}
        onSizeChange={({ height: h }) => {
          // Only a change to an ad that is already showing; see above.
          setHeight((current) => (current > 0 && h > 0 ? Math.round(h) : current));
        }}
        onAdFailedToLoad={onFailed}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    // Clips the native view to the loaded height, which is what keeps an
    // unfilled banner from sitting invisibly over the tab bar.
    overflow: 'hidden',
  },
});
