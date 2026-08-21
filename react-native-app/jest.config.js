module.exports = {
  preset: '@react-native/jest-preset',
  // The RN preset only transpiles react-native itself; these ship untranspiled
  // ESM and crash Jest's CJS runtime without being added to the allowlist.
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|react-native-gesture-handler|react-native-safe-area-context|react-native-screens|react-native-svg|@react-navigation|@notifee|@react-native-google-signin|react-native-purchases|expo(nent)?|@expo(nent)?/.*|expo-modules-core)/)',
  ],
  // Native modules have no implementation under Jest; each needs its official
  // jest setup (gesture-handler) or a mock (jest.setup.js) to render App.
  setupFiles: [
    'react-native-gesture-handler/jestSetup',
    '<rootDir>/jest.setup.js',
  ],
};
