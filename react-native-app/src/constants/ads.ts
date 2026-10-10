import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

/**
 * AdMob ad unit ids, per platform.
 *
 * Fill these in from AdMob > Apps > Kegelee > Ad units. Until a release id is
 * filled in, that placement serves Google's TEST unit even in a release
 * build, so an internal-testing build shows (test) ads where the real ones
 * will go. Test ads earn nothing, so production needs every id below filled
 * in, plus the real app id in app.json.
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
    banner: 'ca-app-pub-5990359088661035/8792661528',
    // No unit of its own yet, so the in-content ads share the banner's.
    inline: '',
    interstitial: 'ca-app-pub-5990359088661035/3540334841',
  },
  ios: {
    banner: '',
    inline: '',
    interstitial: '',
  },
};

const platformUnits = Platform.OS === 'ios' ? RELEASE_UNITS.ios : RELEASE_UNITS.android;

const pick = (release: string, test: string): string =>
  __DEV__ || !release ? test : release;

export const AD_UNITS = {
  banner: pick(platformUnits.banner, TestIds.ADAPTIVE_BANNER),
  // Its own unit so AdMob reports the two placements separately; falls back
  // to the tab banner's unit when only one banner unit has been made.
  inline: pick(platformUnits.inline || platformUnits.banner, TestIds.BANNER),
  interstitial: pick(platformUnits.interstitial, TestIds.INTERSTITIAL),
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
