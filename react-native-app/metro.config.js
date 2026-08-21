const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro configuration
 * https://docs.expo.dev/guides/customizing-metro/
 *
 * Expo SDK 57 bundles its own Metro fork (@expo/metro). Pulling mergeConfig in
 * from @react-native/metro-config resolves the plain `metro` copy instead and
 * the two disagree about the transformer, so the whole config comes from
 * expo/metro-config here.
 *
 * @type {import('expo/metro-config').MetroConfig}
 */
const config = getDefaultConfig(__dirname);

module.exports = config;
