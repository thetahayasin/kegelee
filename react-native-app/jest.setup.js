/* eslint-env jest */
// Mocks for native modules that have no JS-side implementation under Jest.

// async-storage v3 no longer ships a jest mock, so back the API with a Map.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k) => Promise.resolve(store.has(k) ? store.get(k) : null)),
      setItem: jest.fn((k, v) => {
        store.set(k, String(v));
        return Promise.resolve();
      }),
      removeItem: jest.fn((k) => {
        store.delete(k);
        return Promise.resolve();
      }),
      removeMany: jest.fn((keys) => {
        keys.forEach((k) => store.delete(k));
        return Promise.resolve();
      }),
      multiRemove: jest.fn((keys) => {
        keys.forEach((k) => store.delete(k));
        return Promise.resolve();
      }),
      getAllKeys: jest.fn(() => Promise.resolve([...store.keys()])),
      clear: jest.fn(() => {
        store.clear();
        return Promise.resolve();
      }),
    },
  };
});

jest.mock('react-native-sqlite-storage', () => ({
  enablePromise: jest.fn(),
  openDatabase: jest.fn(() =>
    Promise.resolve({
      executeSql: jest.fn(() => Promise.resolve([{ rows: { length: 0, item: jest.fn() } }])),
      transaction: jest.fn(),
      close: jest.fn(() => Promise.resolve()),
    }),
  ),
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    logIn: jest.fn(() => Promise.resolve({})),
    logOut: jest.fn(() => Promise.resolve({})),
    getOfferings: jest.fn(() => Promise.resolve({ current: null })),
    getCustomerInfo: jest.fn(() => Promise.resolve({ entitlements: { active: {} } })),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(() => Promise.resolve({ entitlements: { active: {} } })),
    LOG_LEVEL: { WARN: 'WARN' },
    // Strings, as the real SDK exposes them. The numeric 1/6 that used to sit
    // here are the DEPRECATED PRORATION_MODE values - the exact shape
    // billing.ts was fixed to stop sending, because Play rejects a number
    // where it expects a mode name. A mock reproducing the bug would let the
    // regression back in while the suite stayed green.
    // All five, as the real enum exposes them. Two of them used to be missing
    // here, so billing.ts silently fell through to its own string literals and
    // the tests could not have caught a member being read under the wrong name.
    STORE_REPLACEMENT_MODE: {
      WITHOUT_PRORATION: 'WITHOUT_PRORATION',
      WITH_TIME_PRORATION: 'WITH_TIME_PRORATION',
      CHARGE_FULL_PRICE: 'CHARGE_FULL_PRICE',
      CHARGE_PRORATED_PRICE: 'CHARGE_PRORATED_PRICE',
      DEFERRED: 'DEFERRED',
    },
  },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ type: 'cancelled' })),
    signOut: jest.fn(() => Promise.resolve()),
    getTokens: jest.fn(() => Promise.resolve({})),
  },
  isErrorWithCode: () => false,
  // DEVELOPER_ERROR is the Android-only code 10 that googleAuth now reports
  // separately from a device that simply cannot do native sign-in.
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED', DEVELOPER_ERROR: '10' },
}));

// Every notifee export reminders.ts actually touches. An absent method here is
// not a helpful failure - it surfaces as "undefined is not a function" from
// inside a catch block somewhere, which is the shape of error this mock exists
// to prevent. RepeatFrequency.WEEKLY in particular was missing while the
// scheduler used it, so every trigger in the tests was built with `undefined`
// as its repeat and nothing noticed.
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    requestPermission: jest.fn(() => Promise.resolve({ authorizationStatus: 1 })),
    getNotificationSettings: jest.fn(() =>
      Promise.resolve({
        authorizationStatus: 1,
        android: { alarm: 1 },
      }),
    ),
    createChannel: jest.fn(() => Promise.resolve('channel')),
    deleteChannel: jest.fn(() => Promise.resolve()),
    createTriggerNotification: jest.fn(() => Promise.resolve('id')),
    getTriggerNotifications: jest.fn(() => Promise.resolve([])),
    getTriggerNotificationIds: jest.fn(() => Promise.resolve([])),
    cancelAllNotifications: jest.fn(() => Promise.resolve()),
    cancelTriggerNotification: jest.fn(() => Promise.resolve()),
    cancelTriggerNotifications: jest.fn(() => Promise.resolve()),
    openNotificationSettings: jest.fn(() => Promise.resolve()),
    // App.tsx subscribes to this on mount to record reminder taps. It returns
    // the UNSUBSCRIBE function, so a mock returning undefined breaks the
    // effect's cleanup rather than the effect itself.
    onForegroundEvent: jest.fn(() => jest.fn()),
    onBackgroundEvent: jest.fn(() => jest.fn()),
    // The notification (if any) that launched the app from cold.
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
  },
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  TriggerType: { TIMESTAMP: 0, INTERVAL: 1 },
  RepeatFrequency: { HOURLY: 0, DAILY: 1, WEEKLY: 2 },
  AlarmType: {
    SET_EXACT_AND_ALLOW_WHILE_IDLE: 'SET_EXACT_AND_ALLOW_WHILE_IDLE',
    SET_AND_ALLOW_WHILE_IDLE: 'SET_AND_ALLOW_WHILE_IDLE',
    SET: 'SET',
    SET_EXACT: 'SET_EXACT',
  },
  AndroidNotificationSetting: { ENABLED: 1, DISABLED: 0, NOT_SUPPORTED: -1 },
  AuthorizationStatus: { NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 },
  EventType: { DISMISSED: 0, PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3, TRIGGER_NOTIFICATION_CREATED: 7 },
}));

jest.mock('react-native-keep-awake', () => ({
  activate: jest.fn(),
  deactivate: jest.fn(),
}));

// react-native-haptic-feedback was removed from package.json - nothing imports
// it (WorkoutScreen uses the plain Vibration API and says so in a comment), so
// mocking a module that is no longer a dependency would fail the moment
// node_modules is rebuilt.

// RNRestart is native-only. App.tsx calls it when the first launch flips the
// layout direction; under Jest that would reach a null native module.
jest.mock('react-native-restart', () => ({
  __esModule: true,
  default: { restart: jest.fn() },
  restart: jest.fn(),
}));

// expo-localization reaches into expo-modules-core for the native locale, which
// has no implementation under Jest. A fixed English locale keeps initI18n
// deterministic: tests should not change behaviour with the CI machine's
// regional settings.
jest.mock('expo-localization', () => ({
  getLocales: () => [
    { languageTag: 'en-US', languageCode: 'en', regionCode: 'US', textDirection: 'ltr' },
  ],
  getCalendars: () => [{ timeZone: 'UTC' }],
}));

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
  signInAsync: jest.fn(),
  formatFullName: jest.fn(() => 'Apple User'),
  AppleAuthenticationButton: 'AppleAuthenticationButton',
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { CONTINUE: 2 },
  AppleAuthenticationButtonStyle: { WHITE_OUTLINE: 1 },
}));
