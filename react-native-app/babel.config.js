module.exports = {
  presets: ['module:@react-native/babel-preset'],
  env: {
    // Metro compiles release bundles with envName "production": strip console
    // calls there (they write to logcat via the bridge for no user benefit),
    // keeping error/warn for release diagnostics.
    production: {
      plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]],
    },
  },
};
