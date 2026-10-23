/**
 * react-native as the APP's own files see it: React Native Web, presenting as
 * Android.
 *
 * Only the app's sources are pointed here (see build.js). Libraries keep the
 * real react-native-web, whose Platform says 'web', because their web code
 * paths are the ones that work in a browser. The app itself branches on
 * Platform.OS for Android-only behaviour - Archivo is applied on Android only,
 * for one - so it has to see the platform the screenshots are for.
 */
import React from 'react';
import * as RNW from 'react-native-web';

export * from 'react-native-web';

/**
 * Text that remembers it was asked to fit.
 *
 * React Native Web drops adjustsFontSizeToFit, so a label Android would shrink
 * ("Entrenamiento" under a tab icon) is cut off with an ellipsis instead. The
 * floor is written onto the element as data-fit, and capture.js shrinks any
 * that overflow, down to that floor, before each screenshot.
 *
 * The floor is Android's, not iOS's: React Native on Android ignores
 * minimumFontScale and shrinks to minimumFontSize, 4dp when unset
 * (TextLayoutManager.adjustSpannableFontToFit).
 */
export const Text = React.forwardRef(function FittingText(props, ref) {
  const { adjustsFontSizeToFit, minimumFontScale, minimumFontSize, dataSet, ...rest } = props;
  if (!adjustsFontSizeToFit) return React.createElement(RNW.Text, { ...rest, dataSet, ref });
  return React.createElement(RNW.Text, {
    ...rest,
    ref,
    dataSet: { ...dataSet, fit: String(minimumFontSize ?? 4) },
  });
});

const lang = new URLSearchParams(window.location.search).get('lang') || 'en';
const rtl = ['ar', 'he'].includes(lang.split('-')[0]);

export const Platform = {
  OS: 'android',
  Version: 35,
  isTV: false,
  isTesting: false,
  constants: { Release: '15', Version: 35, Brand: 'google', Model: 'Pixel' },
  select: (spec) =>
    'android' in spec ? spec.android : 'native' in spec ? spec.native : spec.default,
};

/**
 * The direction is decided before the bundle starts, as it is on a phone that
 * has already been relaunched into its language. forceRTL is a no-op so the
 * app never asks for the restart a first launch would.
 */
export const I18nManager = {
  isRTL: rtl,
  doLeftAndRightSwapInRTL: true,
  allowRTL: () => {},
  forceRTL: () => {},
  swapLeftAndRightInRTL: () => {},
  getConstants: () => ({ isRTL: rtl, doLeftAndRightSwapInRTL: true }),
};

export const NativeModules = {
  ...RNW.NativeModules,
  AlarmModule: { showTimePicker: async () => null },
  VibrationModule: {
    getStatus: async () => ({ hasVibrator: true, systemVibrationOn: true, systemVibrationKnown: true }),
    openSystemSoundSettings: async () => false,
  },
};
