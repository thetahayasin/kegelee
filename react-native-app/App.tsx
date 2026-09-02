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
import RNRestart from 'react-native-restart';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import notifee, { EventType } from '@notifee/react-native';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { appPhase } from './src/navigation/phase';
import { setCurrentRouteName } from './src/navigation/currentRoute';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { initDB } from './src/db/sqlite';
import { initI18n } from './src/i18n';
import { reportError } from './src/services/errors';
import { trackAppOpened, trackReminderTapped } from './src/services/events';
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
const Root = ({ resetNonce }: { resetNonce: number }) => {
  const { isLoading, isAuthenticated, basicsDone } = useAuth();
  const palette = useTheme();
  const { scheme } = useThemeMode();
  // The container's own ref rather than reading the navigation state by hand:
  // getCurrentRoute already resolves nested navigators, and the tab inside a
  // stack inside a modal is exactly the case a hand-written walker gets wrong.
  // Typed loose, like every other navigation reference in this app: the route
  // names live in AppNavigator's own param list and nothing here needs to know
  // them - only the string that comes back.
  const navRef = useNavigationContainerRef<any>();
  const publishRoute = () => setCurrentRouteName(navRef.getCurrentRoute()?.name ?? null);
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
  // resetNonce is folded into the key so the crash screen's "Go to start" can
  // discard the navigation state along with the navigator. Clearing the error
  // flag alone would rebuild the same route that just threw.
  return (
    <NavigationContainer
      key={`${phase}:${resetNonce}`}
      ref={navRef}
      theme={navTheme}
      // Both, not just onStateChange: that one does not fire for the first
      // screen, so a crash on the very first render would be reported with no
      // route at all - and the first screen is where a crash is most likely.
      onReady={publishRoute}
      onStateChange={publishRoute}
    >
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
  const [resetNonce, setResetNonce] = useState(0);

  useEffect(() => {
    let mounted = true;
    // Translations load alongside the schema, and BOTH gate the first render.
    // Mounting before i18n resolves would paint one frame of raw keys, then
    // swap - visible as a flash of English (or of key names) on a device set
    // to another language. Neither rejects: initI18n swallows a bad locale
    // file and falls back to English, so a translation problem can never stop
    // the app from starting.
    Promise.all([
      initDB().catch(e => {
        reportError(e, 'app:initDB');
      }),
      initI18n().catch(e => {
        reportError(e, 'app:initI18n');
        return null;
      }),
    ]).then(([, i18nResult]) => {
      if (!mounted) return;
      /**
       * First launch on a right-to-left phone.
       *
       * I18nManager.forceRTL only takes effect on a FRESH bundle, so the run
       * that flips it is left with mirrored text inside an unmirrored layout -
       * navigation gestures, back arrows and every row's alignment all pointing
       * the wrong way. LanguagePicker already reloads for exactly this reason
       * when the language is changed by hand; this is the same thing for the
       * launch where the phone, not the user, chose the direction.
       *
       * Same fallback as the picker: if the native module is missing, carry on
       * rather than getting stuck on the splash. The direction is already
       * stored, so the next cold start comes up correct anyway.
       */
      if (i18nResult?.needsRestart) {
        try {
          RNRestart.restart();
          return;
        } catch (e) {
          reportError(e, 'app:rtlRestart');
        }
      }
      setReady(true);
      // Only once the schema is open, because this writes a row - and after
      // the restart branch above, so a launch that immediately relaunches
      // itself for the layout direction is counted once rather than twice.
      // The 30-minute throttle in events.ts then folds this together with the
      // AppState 'active' that a cold start also produces.
      trackAppOpened('cold');
    });
    return () => {
      mounted = false;
    };
  }, []);

  /**
   * A tapped reminder, while the app is running or when it was not.
   *
   * The notification is the only mechanism this app has for bringing anybody
   * back, and until now nothing recorded whether it ever worked. Two handlers
   * because Notifee splits the cases: onForegroundEvent for a tap on a running
   * app, getInitialNotification for the tap that STARTED it. The background
   * case (app alive but not in front) is registered in index.js, which has to
   * happen outside React.
   */
  useEffect(() => {
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type !== EventType.PRESS) return;
      trackReminderTapped(detail?.notification?.id);
    });

    notifee
      .getInitialNotification()
      .then((initial) => trackReminderTapped(initial?.notification?.id))
      .catch(() => {});

    return unsubscribe;
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
        <ErrorBoundary onReset={() => setResetNonce(n => n + 1)}>
          {ready ? (
            <AuthProvider>
              <Root resetNonce={resetNonce} />
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
