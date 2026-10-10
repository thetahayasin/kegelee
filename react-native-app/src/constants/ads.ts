import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

/**
 * AdMob ad unit ids, per platform.
 *
 * Fill these in from AdMob > Apps > Kegelee > Ad units. Until a release id is
 * filled in, that placement shows NOTHING in a release build rather than a
 * test ad: serving Google's test units to real users is a policy problem, and
 * an empty slot costs nothing.
 *
 * Debug builds always use Google's test units, whatever is filled in here.
 * Clicking your own live ads on a dev device can get the AdMob account
 * suspended, so never point __DEV__ at the real ids.
 *
 * The APP id (the one with a `~`) is not here. It lives in app.json under
 * "react-native-google-mobile-ads", because the native SDK reads it from the
 * manifest / Info.plist before any JS runs.
 */
const RELEASE_UNITS = {
  android: {
    banner: '', // ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN
    interstitial: '', // ca-app-pub-XXXXXXXXXXXXXXXX/NNNNNNNNNN
  },
  ios: {
    banner: '',
    interstitial: '',
  },
};

const platformUnits = Platform.OS === 'ios' ? RELEASE_UNITS.ios : RELEASE_UNITS.android;

export const AD_UNITS = {
  banner: __DEV__ ? TestIds.ADAPTIVE_BANNER : platformUnits.banner || null,
  interstitial: __DEV__ ? TestIds.INTERSTITIAL : platformUnits.interstitial || null,
};

/**
 * The shortest gap between two interstitials.
 *
 * One is offered on the way out of a finished session, and a plan is two
 * sessions a day, so in ordinary use this never binds. It exists for the
 * person who runs short single-exercise trials back to back, who would
 * otherwise get a full-screen ad after every 30-second try.
 */
export const INTERSTITIAL_MIN_GAP_MS = 3 * 60 * 1000;
