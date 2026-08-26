import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  Pressable,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, TYPE, SPACE, RADIUS } from '../theme/colors';

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
}

const EyeIcon: React.FC<{ off: boolean }> = ({ off }) => (
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

export const AuthField: React.FC<AuthFieldProps> = ({
  label,
  errorText,
  secure,
  style,
  ...rest
}) => {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const invalid = !!errorText;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, invalid && styles.labelError]}>{label}</Text>

      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          invalid && styles.fieldError,
        ]}
      >
        <TextInput
          {...rest}
          style={[styles.input, style]}
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
      {invalid ? <Text style={styles.error}>{errorText}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 7 },
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
  fieldFocused: { borderColor: COLORS.accent },
  fieldError: { borderColor: COLORS.danger },

  input: {
    flex: 1,
    color: COLORS.white,
    fontSize: 16,
    // Android centres short text oddly without this on a fixed-height row.
    paddingVertical: SPACE.md,
  },
  eye: { padding: 2 },
  error: { ...TYPE.caption, color: COLORS.danger },
});
