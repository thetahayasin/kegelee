import React from 'react';
import {
  TouchableOpacity as RNTouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';

/**
 * TouchableOpacity with a press opacity that suits this theme.
 *
 * React Native's built-in default for `activeOpacity` is 0.2, so pressing any
 * control drops it to a fifth of its opacity. Against this near-black ground
 * that does not read as a press, it reads as the element briefly disappearing.
 * Almost every touchable in the app inherited that default.
 *
 * 0.85 is felt without the control dissolving. Spreading `props` after the
 * default means any component that sets its own `activeOpacity` (several pass
 * 1 to opt out entirely) still wins.
 */
export const TouchableOpacity = (props: TouchableOpacityProps) => (
  <RNTouchableOpacity activeOpacity={0.85} {...props} />
);
