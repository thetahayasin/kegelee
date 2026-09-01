import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  type LayoutChangeEvent,
  Pressable,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { TYPE, SPACE, RADIUS, Palette } from '../theme/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

/**
 * The text field the auth screens share.
 *
 * They previously each rolled their own: hardcoded `height: 52`,
 * `borderRadius: 12`, `fontSize: 16` and a raw `rgba(255,255,255,0.1)` border,
 * none of which matched the TYPE/SPACE/RADIUS tokens the rest of the app is
 * built from. That mismatch is most of why the auth flow looked unfinished
 * next to the screens behind it.
 *
 * Two behaviours the old fields lacked:
 *
 * A VISIBLE LABEL. They relied on the placeholder alone, so the moment someone
 * typed, the only thing telling them what the field was disappeared - and on a
 * password field being re-entered after an error, that is exactly when the
 * label matters. The placeholder now carries an example or a hint instead, and
 * the label stays put.
 *
 * A FOCUS STATE. There was no visual response to focus at all, so on a form
 * with two identical-looking boxes you could not see where typing would go.
 * The accent border is also what makes the field pass a non-text contrast
 * check against the surface behind it.
 */

export interface AuthFieldProps extends TextInputProps {
  label: string;
  /** Renders the field in its error state and reserves room for the message. */
  errorText?: string | null;
  /** Adds the show/hide control. */
  secure?: boolean;
  /** Tighter vertical rhythm, for a form that has to fit a short window. */
  compact?: boolean;
}

/**
 * Whether the auth forms should use their tighter rhythm, from the box they
 * were actually given.
 *
 * The first version of this compared the WINDOW height against a constant,
 * and that was wrong twice over. The window includes the status bar, the
 * navigation bar and the screen's own header row, so a phone reporting 800dp
 * hands the form nearer 690 - it stayed on the roomy rhythm and overflowed.
 * And the window does not shrink when the keyboard opens, which is the moment
 * the box actually halves.
 *
 * So it is measured. `onLayout` goes on the scroll view that holds the form,
 * which is the exact box the content has to fit into, keyboard included.
 *
 * Compact until proven otherwise: being a little too dense for one frame is
 * invisible, being too loose means the button starts off-screen.
 */
export const useAuthFit = (roomyMin: number) => {
  const [box, setBox] = useState<number | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    // Rounded and thresholded so a sub-pixel layout cannot ping-pong.
    setBox((prev) => (prev === null || Math.abs(prev - next) > 4 ? next : prev));
  }, []);

  return { compact: box === null || box < roomyMin, onLayout };
};

/**
 * The height each form needs before it can afford the roomy rhythm.
 *
 * Measured from the parts rather than picked: Sign up is four labelled fields
 * at 56, a hint, a 56 button, a divider with 24 above and below, the Google
 * button and the footer link, which comes to about 750. Log in is the same
 * shape with two fields and a forgot-password row, about 590.
 *
 * Both numbers sit ABOVE what the roomy rhythm needs, deliberately. The two
 * states are not symmetrical: compact on a screen with room to spare is
 * slightly dense and nobody notices, while roomy on a screen without it puts
 * the submit button off the bottom. When it is a close call, take compact.
 */
export const AUTH_ROOMY_MIN = { login: 640, register: 800 } as const;

const EyeIcon: React.FC<{ off: boolean }> = ({ off }) => {
  const COLORS = useTheme();
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"
        stroke={COLORS.textMuted}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke={COLORS.textMuted}
        strokeWidth={1.8}
      />
      {off ? (
        <Path d="M4 20L20 4" stroke={COLORS.textMuted} strokeWidth={1.8} strokeLinecap="round" />
      ) : null}
    </Svg>
  );
};

export const AuthField: React.FC<AuthFieldProps> = ({
  label,
  errorText,
  secure,
  compact,
  style,
  ...rest
}) => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const invalid = !!errorText;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {/* Capped against the system font scale. These forms promise to fit
          without scrolling, and a 2x accessibility font would otherwise break
          that promise silently - the button would simply be off-screen. The
          cap keeps the text growing, just not without limit. */}
      <Text
        style={[styles.label, invalid && styles.labelError]}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>

      <View
        style={[
          styles.field,
          compact && styles.fieldCompact,
          focused && styles.fieldFocused,
          invalid && styles.fieldError,
        ]}
      >
        <TextInput
          {...rest}
          maxFontSizeMultiplier={1.3}
          style={[styles.input, compact && styles.inputCompact, style]}
          placeholderTextColor={COLORS.textDim}
          secureTextEntry={secure ? hidden : false}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
        />

        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={12}
            style={styles.eye}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ expanded: !hidden }}
          >
            <EyeIcon off={hidden} />
          </Pressable>
        ) : null}
      </View>

      {/* Beneath the field it describes, not collected at the top of the form:
          an error the user has to scroll away from to act on is not feedback. */}
      {invalid ? (
        <Text style={styles.error} maxFontSizeMultiplier={1.3}>
          {errorText}
        </Text>
      ) : null}
    </View>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  wrap: { gap: 7 },
  wrapCompact: { gap: 5 },
  label: {
    ...TYPE.bodySm,
    color: COLORS.textMuted,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  labelError: { color: COLORS.danger },

  field: {
    minHeight: 56,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    gap: SPACE.sm,
  },
  fieldCompact: { minHeight: 50 },
  fieldFocused: { borderColor: COLORS.accent },
  fieldError: { borderColor: COLORS.danger },

  input: {
    flex: 1,
    color: COLORS.white,
    fontSize: 16,
    // Android centres short text oddly without this on a fixed-height row.
    paddingVertical: SPACE.md,
  },
  inputCompact: { paddingVertical: SPACE.sm },
  eye: { padding: 2 },
  error: { ...TYPE.caption, color: COLORS.danger },
});
