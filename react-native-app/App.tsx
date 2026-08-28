/**
 * Kegelee - React Native client
 *
 * App shell: initialises the local SQLite schema, restores the auth session,
 * and hands off to the auth-gated navigator. The native launch splash
 * (windowBackground) shows the KE logo on #060810 until the first JS frame;
 * this component then keeps an identical dark loading screen on-screen while
 * the DB opens and the session is restored, so there is no white flash.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { appPhase } from './src/navigation/phase';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { initDB } from './src/db/sqlite';
import { initI18n } from './src/i18n';
import { COLORS } from './src/theme/colors';

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: COLORS.accent,
    background: COLORS.bg,
    card: COLORS.surface,
    text: COLORS.text,
    border: COLORS.whiteFaint,
    notification: COLORS.accent,
  },
};

/** Dark loading screen matching the native splash / auth-loading design. */
const SplashLoading = () => (
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

/**
 * Waits for the session restore before revealing the navigator.
 *
 * The NavigationContainer is keyed by the app phase. Navigation STATE lives
 * in the container, not in the navigators, so a stack swap without a key
 * change hands the old routes to the new navigator - which is how finishing
 * the basics re-showed the finished lesson, and how buying a subscription
 * left the customer on the paywall. navigation/phase carries the full
 * account of that and is the single source both this and AppNavigator read.
 */
const Root = () => {
  const { isLoading, isAuthenticated, basicsDone, subscribed } = useAuth();
  if (isLoading) {
    return <SplashLoading />;
  }
  // Shared with AppNavigator's own branching - see navigation/phase.
  const phase = appPhase({ isAuthenticated, subscribed, basicsDone });
  return (
    <NavigationContainer key={phase} theme={navTheme}>
      <AppNavigator />
    </NavigationContainer>
  );
};

const App = () => {
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
    <GestureHandlerRootView style={styles.flex}>
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
        <StatusBar barStyle="light-content" />
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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

export default App;
