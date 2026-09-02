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
import { reportError } from '../services/errors';
import { trackCurrent } from '../services/events';
import { getCurrentRouteName } from '../navigation/currentRoute';

interface Props {
  children: React.ReactNode;
  /**
   * Throw the navigator away and build a new one.
   *
   * "Try again" only clears this component's error flag, so it re-renders the
   * SAME subtree with the same props and the same navigation state - which,
   * for the errors that actually reach here (a screen rendering a row that
   * cannot be rendered), reliably throws again on the next frame and leaves
   * the reader tapping a button that does nothing. The owner of the navigator
   * passes this to bump its key instead, which discards the route that was on
   * screen and starts from the first one.
   */
  onReset?: () => void;
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
    // The single hook a crash reporter gets wired into - see services/errors.
    reportError(error, 'ErrorBoundary');

    /**
     * Also recorded as an event, because reportError only reaches a console.
     *
     * "The app crashes sometimes" is unactionable; "eleven crashes this week,
     * all on ExerciseDetail" is a bug fixed in an afternoon. The route name is
     * the whole point of recording it, and it comes from the module in
     * navigation/currentRoute rather than from a hook - this is a class
     * component, and it is running at the exact moment the tree it would have
     * to read from is failing.
     *
     * The message is truncated hard. A stack trace is not wanted here (it goes
     * to the crash reporter), the column is small, and a message is only ever
     * read as a label to group by.
     */
    const message = error instanceof Error ? error.message : String(error);
    trackCurrent('error_boundary_hit', getCurrentRouteName(), null, {
      message: message.slice(0, 200),
    });
  }

  private reset = () => this.setState({ hasError: false });

  private resetToStart = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

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
        {/*
          Only offered when somebody can actually act on it. A defaultValue is
          given because this key is newer than the translation files: without
          one a reader on a device with no translation would see the dotted key
          path itself, which is worse than untranslated English.
        */}
        {this.props.onReset ? (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={this.resetToStart}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryBtnText}>
              {i18n.t('errorBoundary.goToStart', { defaultValue: 'Go to start' })}
            </Text>
          </TouchableOpacity>
        ) : null}
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
  secondaryBtn: {
    marginTop: 12,
    height: 52,
    paddingHorizontal: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.whiteFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
});
