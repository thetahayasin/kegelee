module.exports = {
  preset: '@react-native/jest-preset',
  // The RN preset only transpiles react-native itself; these ship untranspiled
  // ESM and crash Jest's CJS runtime without being added to the allowlist.
  transformIgnorePatterns: [
    // `expo(nent)?` matches the `expo` package only - it does NOT cover the
    // expo-* siblings, which is why expo-localization crashed the suite with
    // "Cannot use import statement outside a module". `expo-.*` covers every
    // current and future one, so this list stops needing an edit per package.
    'node_modules/(?!(@react-native|react-native|react-native-gesture-handler|react-native-safe-area-context|react-native-screens|react-native-svg|@react-navigation|@notifee|@react-native-google-signin|react-native-purchases|expo(nent)?|expo-.*|@expo(nent)?/.*)/)',
  ],
  // Native modules have no implementation under Jest; each needs its official
  // jest setup (gesture-handler) or a mock (jest.setup.js) to render App.
  setupFiles: [
    'react-native-gesture-handler/jestSetup',
    '<rootDir>/jest.setup.js',
  ],
};
