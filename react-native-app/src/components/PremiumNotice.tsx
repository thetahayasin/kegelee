import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import { TouchableOpacity } from './Touchable';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import Svg, { Path, Rect } from 'react-native-svg';
import { TYPE, SPACE, RADIUS, Palette } from '../theme/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

/**
 * One line at the top of a screen that a free account can see but not fully use.
 *
 * This replaced a full-page lock, and the reason is worth keeping. The lock
 * put "subscribe to unlock progress tracking" where the progress tracker
 * should have been, which asks somebody to pay for a thing they have never
 * been allowed to look at. It also read as a broken app rather than as an
 * offer.
 *
 * The screen now renders in full and this sits above it, so the reader can see
 * exactly what they would be buying. The actual ask happens on the control -
 * the Measure button, the reminders card - at the moment they reach for it,
 * which is when they want it rather than when they arrived.
 */
interface Props {
  /** One short line naming what this screen does with a subscription. */
  textKey: string;
}

export const PremiumNotice: React.FC<Props> = ({ textKey }) => {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const navigation = useNavigation<NavigationProp<any>>();

  return (
    <TouchableOpacity
      style={styles.wrap}
      accessibilityRole="button"
      onPress={() => navigation.navigate('Paywall')}
    >
      <View style={styles.icon}>
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
          <Rect x={5} y={11} width={14} height={9} rx={2} stroke={COLORS.accentText} strokeWidth={2} />
          <Path d="M8 11V8a4 4 0 018 0v3" stroke={COLORS.accentText} strokeWidth={2} />
        </Svg>
      </View>

      <Text style={styles.text} numberOfLines={2}>
        {t(textKey)}
      </Text>

      <Text style={styles.cta} numberOfLines={1}>
        {t('premium.badge')}
      </Text>
    </TouchableOpacity>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    marginHorizontal: SPACE.lg,
    /**
     * Top margin only.
     *
     * Every card this sits above brings its own `marginTop` - 24 on the
     * progress chart, 20 on the reminders card - and margins between siblings
     * do not collapse in React Native the way they do on the web. A bottom
     * margin here simply added to theirs, so the notice floated in 40pt of
     * nothing above the thing it was introducing.
     */
    marginTop: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accentWash,
    borderWidth: 1,
    borderColor: COLORS.accentEdge,
  },
  icon: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // flexShrink so a long translation wraps inside the row instead of pushing
  // the label off the end of it.
  text: { ...TYPE.caption, color: COLORS.text, flex: 1, lineHeight: 17 },
  cta: { ...TYPE.caption, color: COLORS.accentText, fontWeight: '700' },
});
