import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { AD_UNITS } from '../constants/ads';
import { useAdsReady } from '../services/ads';
import { SPACE } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  /**
   * 'rectangle' is the 300x250 unit, the best earner for an ad sitting at
   * the end of a list someone has scrolled through. 'banner' is a short
   * adaptive strip for a screen whose content is mostly reading.
   */
  variant?: 'rectangle' | 'banner';
}

/**
 * An ad placed INSIDE a screen's scroll content, at the end of it.
 *
 * Always the last thing in the scroll, after what the person came for, and
 * with a gutter on both sides so it never sits against a button: Google treats
 * an ad crowding a control as an invitation to accidental taps. Labelled, so
 * it is never mistaken for part of the app.
 *
 * Takes no room at all until an ad has actually loaded, so no fill, no
 * consent and offline all look exactly like the screen did before.
 */
export const InlineAd: React.FC<Props> = ({ variant = 'rectangle' }) => {
  const adsReady = useAdsReady();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const { t } = useTranslation();
  const COLORS = useTheme();

  const unitId = AD_UNITS.inline;
  if (!adsReady || !unitId || failed) return null;

  return (
    <View style={[styles.wrap, !loaded && styles.collapsed]}>
      {loaded && (
        <Text style={[styles.label, { color: COLORS.textDim }]}>{t('ads.label')}</Text>
      )}
      <BannerAd
        unitId={unitId}
        size={
          variant === 'rectangle'
            ? BannerAdSize.MEDIUM_RECTANGLE
            : BannerAdSize.INLINE_ADAPTIVE_BANNER
        }
        maxHeight={variant === 'banner' ? 120 : undefined}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginVertical: SPACE.xl,
  },
  // Mounted so it can load, but invisible and zero-height until it has.
  collapsed: {
    height: 0,
    marginVertical: 0,
    overflow: 'hidden',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: SPACE.xs,
  },
});
