/**
 * Kegelee - React Native client
 *
 * App shell: initialises the local SQLite schema, restores the auth session,
 * and hands off to the auth-gated navigator. The native launch splash
 * (windowBackground) shows the KE logo on #060810 until the first JS frame;
 * this component then keeps an identical dark loading screen on-screen while
 * the DB opens and the session is restored, so there is no white flash.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { appPhase } from './src/navigation/phase';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { initDB } from './src/db/sqlite';
import { initI18n } from './src/i18n';
import { Palette } from './src/theme/colors';
import {
  ThemeProvider,
  useTheme,
  useThemeMode,
  useThemedStyles,
} from './src/theme/ThemeContext';

/**
 * React Navigation's own theme, which paints the gaps this app does not.
 *
 * Screen transitions, the card behind a modal and the flash between two
 * screens all come from here rather than from any stylesheet. Left on the
 * built-in DarkTheme it stayed dark forever, so a light-mode reader saw a
 * black rectangle every time a screen pushed.
 */
const makeNavTheme = (COLORS: Palette, scheme: 'light' | 'dark') => {
  const base = scheme === 'light' ? DefaultTheme : DarkTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: COLORS.accent,
      background: COLORS.bg,
      card: COLORS.surface,
      text: COLORS.text,
      border: COLORS.whiteFaint,
      notification: COLORS.accent,
    },
  };
};

/** Loading screen matching the native splash / auth-loading design. */
const SplashLoading = () => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  return (
    <View style={styles.splash}>
      <Image
        source={require('./src/assets/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <ActivityIndicator
        size="small"
        color={COLORS.accent}
        style={styles.spinner}
      />
    </View>
  );
};

/**
 * Waits for the session restore before revealing the navigator.
 *
 * The NavigationContainer is keyed by the app phase. Navigation STATE lives
 * in the container, not in the navigators, so a stack swap without a key
 * change hands the old routes to the new navigator - which is how finishing
 * the basics once re-showed the finished lesson. navigation/phase carries the
 * full account, and is the single source both this and AppNavigator read.
 */
const Root = () => {
  const { isLoading, isAuthenticated, basicsDone } = useAuth();
  const palette = useTheme();
  const { scheme } = useThemeMode();
  // Rebuilt only when the appearance actually changes. Handing
  // NavigationContainer a fresh object every render makes it re-render the
  // whole navigator on every state change anywhere above it.
  const navTheme = useMemo(
    () => makeNavTheme(palette, scheme),
    [palette, scheme],
  );
  if (isLoading) {
    return <SplashLoading />;
  }
  // Shared with AppNavigator's own branching - see navigation/phase.
  const phase = appPhase({ isAuthenticated, basicsDone });
  return (
    <NavigationContainer key={phase} theme={navTheme}>
      <AppNavigator />
    </NavigationContainer>
  );
};

/**
 * Everything below the appearance provider.
 *
 * Split out because the status bar style is decided here, and a component
 * cannot read a context its own JSX provides. ThemeProvider wraps this rather
 * than living inside it.
 */
const Shell = () => {
  const { scheme } = useThemeMode();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Translations load alongside the schema, and BOTH gate the first render.
    // Mounting before i18n resolves would paint one frame of raw keys, then
    // swap - visible as a flash of English (or of key names) on a device set
    // to another language. Neither rejects: initI18n swallows a bad locale
    // file and falls back to English, so a translation problem can never stop
    // the app from starting.
    Promise.all([
      initDB().catch(e => console.error('DB init failed', e)),
      initI18n().catch(e => console.error('i18n init failed', e)),
    ]).finally(() => {
      if (mounted) {
        setReady(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <GestureHandlerRootView style={staticStyles.flex}>
      <SafeAreaProvider>
        {/*
          barStyle only. `backgroundColor` was the one deprecated edge-to-edge
          API this app actually reached: it routes to StatusBarModule.setColor
          -> Window.setStatusBarColor, which Android 15 deprecated. Under
          edge-to-edge the bar is transparent anyway and RN drops the call on
          the floor, so the prop bought nothing and cost a Play warning.
          `translucent` is likewise a no-op once edge-to-edge is on.
          barStyle goes through WindowInsetsController, which is current.
        */}
        {/* Follows the appearance: dark glyphs on a light ground and the
            other way round. Left at light-content the clock and battery were
            invisible in light mode. */}
        <StatusBar barStyle={scheme === 'light' ? 'dark-content' : 'light-content'} />
        <ErrorBoundary>
          {ready ? (
            <AuthProvider>
              <Root />
            </AuthProvider>
          ) : (
            <SplashLoading />
          )}
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

/**
 * The one style with no colour in it, and the one used above the provider.
 * Kept separate so the root view does not need a hook to exist.
 */
const staticStyles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 120,
  },
  spinner: {
    marginTop: 28,
  },
});

/**
 * The appearance provider sits above everything, including the status bar and
 * the crash boundary's children, so there is no frame in which the tree is
 * rendered against the wrong palette.
 */
const App = () => (
  <ThemeProvider>
    <Shell />
  </ThemeProvider>
);

export default App;
