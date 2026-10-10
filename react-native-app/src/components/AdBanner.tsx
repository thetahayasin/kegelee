import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AD_UNITS } from '../constants/ads';
import { setBannerHeight, useAdsReady } from '../services/ads';

/**
 * The one banner: an anchored adaptive strip under the floating tab bar.
 *
 * Only ever mounted by the tab navigator, so it is on screen for the four tabs
 * and nowhere else. A workout, its completion screen and the lessons are
 * pushed OVER the tabs and cover it - nobody gets an ad while they are
 * counting contractions.
 *
 * It reports its real height to services/ads, and reports 0 when it has no
 * ad, so the space is only taken while there is something in it.
 */
export const AdBanner: React.FC = () => {
  const adsReady = useAdsReady();

  // Leaving the tabs (sign-out, the basics gate) must give the space back.
  useEffect(() => () => setBannerHeight(0), []);

  if (!adsReady || !AD_UNITS.banner) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <BannerAd
        unitId={AD_UNITS.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={({ height }) => setBannerHeight(height)}
        onSizeChange={({ height }) => setBannerHeight(height)}
        onAdFailedToLoad={() => setBannerHeight(0)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
});
