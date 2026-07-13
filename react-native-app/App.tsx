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
import { initDB } from './src/db/sqlite';
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

/** Waits for the session restore before revealing the navigator. */
const Root = () => {
  const { isLoading } = useAuth();
  if (isLoading) {
    return <SplashLoading />;
  }
  return <AppNavigator />;
};

const App = () => {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    initDB()
      .catch(e => console.error('DB init failed', e))
      .finally(() => {
        if (mounted) {
          setDbReady(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <StatusBar
          barStyle="light-content"
          backgroundColor="transparent"
          translucent
        />
        {dbReady ? (
          <AuthProvider>
            <NavigationContainer theme={navTheme}>
              <Root />
            </NavigationContainer>
          </AuthProvider>
        ) : (
          <SplashLoading />
        )}
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
