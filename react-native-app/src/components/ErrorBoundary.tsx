import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';
import { TouchableOpacity } from './Touchable';
// The i18n instance directly, not the useTranslation hook: this is a class
// component, and it renders precisely when something has already failed - so
// it should depend on as little React machinery as possible. i18next falls
// back to English per key, so an i18n failure still yields readable text.
import i18n from '../i18n';
// The DARK palette by name, not the live one from useTheme(). This is a
// class component, so it cannot read a hook - and it renders exactly when
// something has already gone wrong, which is the worst moment to depend on a
// context provider that may itself be part of the failure. A crash screen
// that is always dark is a small inconsistency; a crash screen that crashes
// is not.
import { DARK as COLORS } from '../theme/colors';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * App-wide error boundary. Catches render/lifecycle errors anywhere in the tree
 * so a single bad screen shows a recoverable fallback instead of crashing the
 * app to a blank screen (release) or red box (dev). Error boundaries must be
 * class components - there is no hook equivalent.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (__DEV__) {
      console.error('Uncaught error in React tree', error);
    }
    // When a crash reporter (Sentry / Crashlytics) is added, report it here.
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <View style={styles.container}>
        <Image
          source={require('../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>{i18n.t('errorBoundary.somethingWentWrong')}</Text>
        <Text style={styles.body}>
          {i18n.t('errorBoundary.theAppHitAnUnexpected')}
        </Text>
        <TouchableOpacity style={styles.btn} onPress={this.reset} activeOpacity={0.85}>
          <Text style={styles.btnText}>{i18n.t('errorBoundary.tryAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
  },
  body: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  btn: {
    marginTop: 28,
    height: 52,
    paddingHorizontal: 40,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
});
