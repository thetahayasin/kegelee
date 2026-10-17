/**
 * AdMob: consent, SDK start-up, the interstitial, and the banner's height.
 *
 * Order matters and is the reason this is one module. Google's consent
 * (UMP) has to be gathered BEFORE `mobileAds().initialize()`, because the SDK
 * may start requesting ads the moment it is initialised, and an EEA/UK user
 * must have answered the consent form before that happens. So nothing in the
 * app requests an ad until `initAds()` has run the form and been told
 * `canRequestAds`.
 *
 * Everything here swallows its own failures. An ad that does not load is an
 * empty slot, never an error screen: the app works the same with no fill, no
 * network and no consent.
 */
import { useEffect, useState } from 'react';
import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  InterstitialAd,
  MaxAdContentRating,
} from 'react-native-google-mobile-ads';
import { AD_UNITS, INTERSTITIAL_MIN_GAP_MS, TEST_DEVICE_IDS } from '../constants/ads';
import { FREE_APP } from '../constants/monetization';
import { reportError } from './errors';

let ready = false;
let initPromise: Promise<boolean> | null = null;
let privacyOptionsRequired = false;

const readyListeners = new Set<(ready: boolean) => void>();
const setReady = (value: boolean) => {
  ready = value;
  readyListeners.forEach((l) => l(value));
};

/**
 * Ask for consent where the law requires it, then start the SDK.
 *
 * Idempotent: App.tsx calls it once the shell is up, and a second call (a
 * remount after the error boundary resets) returns the same promise instead
 * of showing the consent form twice.
 */
export const initAds = (): Promise<boolean> => {
  if (!FREE_APP) return Promise.resolve(false);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      // Shows the form only when one is required (EEA, UK, Switzerland, and
      // the US states AdMob is configured for) and not yet answered. For
      // everyone else this resolves straight away.
      const info = await AdsConsent.gatherConsent().catch((e) => {
        reportError(e, 'ads:gatherConsent');
        return null;
      });
      // A failed consent request still leaves the previous session's answer
      // on the device, so ask what it says before giving up.
      const current = info ?? (await AdsConsent.getConsentInfo().catch(() => null));
      privacyOptionsRequired =
        current?.privacyOptionsRequirementStatus ===
        AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
      if (!current?.canRequestAds) return false;

      await mobileAds().setRequestConfiguration({
        // A pelvic floor trainer is used by adults, often in front of other
        // people. Keep the creative to general-audience material so the app
        // never puts something embarrassing on screen mid-routine.
        maxAdContentRating: MaxAdContentRating.PG,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
        testDeviceIdentifiers: TEST_DEVICE_IDS,
      });
      await mobileAds().initialize();
      setReady(true);
      preloadInterstitial();
      return true;
    } catch (e) {
      reportError(e, 'ads:init');
      return false;
    }
  })();
  return initPromise;
};

/** Whether the SDK is up and ads may be requested. Re-renders when it flips. */
export const useAdsReady = (): boolean => {
  const [value, setValue] = useState(ready);
  useEffect(() => {
    setValue(ready);
    readyListeners.add(setValue);
    return () => {
      readyListeners.delete(setValue);
    };
  }, []);
  return value;
};

// ---------------------------------------------------------------------------
// Privacy options ("change my ad consent")
// ---------------------------------------------------------------------------

/**
 * Whether this person must be offered a way to change their consent.
 *
 * Required by Google's EU User Consent Policy wherever the form was shown:
 * the choice has to be revisitable from inside the app, so Settings draws a
 * row for it when, and only when, this is true.
 */
export const adPrivacyOptionsRequired = async (): Promise<boolean> => {
  if (!FREE_APP) return false;
  if (privacyOptionsRequired) return true;
  try {
    const info = await AdsConsent.getConsentInfo();
    privacyOptionsRequired =
      info.privacyOptionsRequirementStatus ===
      AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  } catch {
    // Unknown is treated as not required; the row simply does not appear.
  }
  return privacyOptionsRequired;
};

/**
 * Re-open the consent form.
 *
 * If somebody who had declined now agrees, the SDK has to be started - it was
 * skipped at launch - so this re-runs the init path when it was never ready.
 */
export const openAdPrivacyOptions = async (): Promise<void> => {
  try {
    const info = await AdsConsent.showPrivacyOptionsForm();
    if (info.canRequestAds && !ready) {
      initPromise = null;
      await initAds();
    }
  } catch (e) {
    reportError(e, 'ads:privacyOptions');
  }
};

// ---------------------------------------------------------------------------
// Interstitial
// ---------------------------------------------------------------------------

let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;
let interstitialLoading = false;
let lastShownAt = 0;

/**
 * Retry a failed interstitial load, backing off.
 *
 * The first load runs at launch. On a new AdMob account most requests come
 * back "no fill", and without a retry the next attempt waited for the next
 * finished workout - so the first session of the day almost never had an ad
 * ready for it.
 */
const RETRY_FIRST_MS = 60 * 1000;
const RETRY_MAX_MS = 10 * 60 * 1000;
let retryMs = RETRY_FIRST_MS;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleRetry = () => {
  if (retryTimer) return;
  const delay = retryMs;
  retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    preloadInterstitial();
  }, delay);
};

const preloadInterstitial = () => {
  if (!ready || !AD_UNITS.interstitial) return;
  if (interstitialLoaded || interstitialLoading) return;
  try {
    if (!interstitial) {
      interstitial = InterstitialAd.createForAdRequest(AD_UNITS.interstitial);
      interstitial.addAdEventListener(AdEventType.LOADED, () => {
        interstitialLoaded = true;
        interstitialLoading = false;
        retryMs = RETRY_FIRST_MS;
      });
      interstitial.addAdEventListener(AdEventType.ERROR, () => {
        // No fill or no network. Try again later rather than waiting for
        // the next workout to ask.
        interstitialLoaded = false;
        interstitialLoading = false;
        scheduleRetry();
      });
    }
    interstitialLoading = true;
    interstitial.load();
  } catch (e) {
    interstitialLoading = false;
    reportError(e, 'ads:interstitialLoad');
  }
};

/**
 * Show the interstitial if one is ready, then run `next`.
 *
 * `next` always runs - immediately when there is no ad, after the ad is
 * closed when there is one - so a caller can put its navigation behind this
 * without ever being stranded by an ad that failed. A hard ceiling stops a
 * close event that never arrives from leaving the person on the screen
 * forever.
 */
export const showInterstitialThen = (next: () => void): void => {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    next();
    // Load the next one now, so it has a session's worth of time to arrive.
    preloadInterstitial();
  };

  const ad = interstitial;
  const tooSoon = Date.now() - lastShownAt < INTERSTITIAL_MIN_GAP_MS;
  if (!ready || !ad || !interstitialLoaded || tooSoon) {
    finish();
    return;
  }

  interstitialLoaded = false;
  lastShownAt = Date.now();
  const unsubClose = ad.addAdEventListener(AdEventType.CLOSED, () => {
    unsubClose();
    finish();
  });
  ad.show().catch((e) => {
    unsubClose();
    reportError(e, 'ads:interstitialShow');
    finish();
  });
  // An interstitial cannot be dismissed by anything but its own close
  // button, so two minutes is far past any real ad - it only fires if the
  // CLOSED event was lost.
  setTimeout(finish, 2 * 60 * 1000);
};

// ---------------------------------------------------------------------------
// Banner height
// ---------------------------------------------------------------------------

/**
 * The height the tab banner currently occupies, in dp. 0 while there is no
 * ad - no consent, no fill, offline - so the tab bar and every tab screen's
 * bottom padding sit exactly where they did before ads existed.
 *
 * Shared state rather than a prop because the tab bar (AppNavigator) and the
 * four tab screens each compute their own bottom clearance and all of them
 * have to move together when the banner arrives or goes.
 */
let bannerHeight = 0;
const bannerListeners = new Set<(h: number) => void>();

export const setBannerHeight = (h: number): void => {
  const next = Math.max(0, Math.round(h));
  if (next === bannerHeight) return;
  bannerHeight = next;
  bannerListeners.forEach((l) => l(next));
};

export const useBannerHeight = (): number => {
  const [value, setValue] = useState(bannerHeight);
  useEffect(() => {
    setValue(bannerHeight);
    bannerListeners.add(setValue);
    return () => {
      bannerListeners.delete(setValue);
    };
  }, []);
  return value;
};
