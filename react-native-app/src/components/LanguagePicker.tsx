import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import RNRestart from 'react-native-restart';
import Svg, { Path } from 'react-native-svg';

import { TouchableOpacity } from './Touchable';
import { Palette } from '../theme/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import i18n, { LanguageTag, SUPPORTED_LANGUAGES, setLanguage } from '../i18n';
import { refreshContentForCurrentLocale } from '../services/sync';
import { trackCurrent } from '../services/events';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Language chooser.
 *
 * Each language is listed in its OWN name - Deutsch, 日本語, العربية - never
 * translated into the current one. Someone looking for their language does not
 * read the language they are stuck in, so "German" is useless to the person who
 * needs it most.
 *
 * English is pinned first as the guaranteed-complete fallback; the rest follow
 * the declaration order in SUPPORTED_LANGUAGES.
 */
export const LanguagePicker: React.FC<Props> = ({ visible, onClose }) => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t } = useTranslation();
  const [restartNeeded, setRestartNeeded] = useState(false);
  // Held so unmounting the picker cannot leave a restart armed. Without this,
  // closing the sheet in the 250ms window still killed the app a moment later.
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (restartTimer.current) clearTimeout(restartTimer.current);
    },
    [],
  );

  const current = i18n.language as LanguageTag;
  const tags = Object.keys(SUPPORTED_LANGUAGES) as LanguageTag[];

  const restartNow = () => {
    // Switching between LTR and RTL flips the whole layout, and I18nManager
    // cannot do that to a running bundle - the change only lands on a fresh
    // one. Rather than leaving the user to close and reopen the app by hand
    // (which the previous build asked them to do, and which reads like a
    // failure), reload it for them. The language choice is already persisted,
    // so the new bundle comes up in the right language and direction.
    //
    // A frame of delay lets AsyncStorage flush and the picker paint its
    // closing state, so the restart looks deliberate rather than like a crash.
    // If the native module is missing for any reason, fall back to the
    // ask-the-user prompt instead of silently doing nothing.
    onClose();
    restartTimer.current = setTimeout(() => {
      restartTimer.current = null;
      try {
        RNRestart.restart();
      } catch {
        setRestartNeeded(true);
      }
    }, 250);
  };

  const choose = async (tag: LanguageTag) => {
    if (tag === current) {
      onClose();
      return;
    }
    /**
     * Recorded around the switch, with the OLD tag as the detail.
     *
     * Both halves matter. The new tag says which languages are worth keeping
     * translated; the old one says what they were reading before, which is the
     * only way to see people arriving on a device language the app guessed
     * wrong and correcting it by hand - a mis-detected locale looks exactly
     * like a happy user until you can see them leaving it.
     *
     * This component is used from Settings and from the guest screens, so it
     * uses the current-user helper rather than requiring an account.
     */
    trackCurrent('language_changed', tag, current);
    const { needsRestart } = await setLanguage(tag);
    // Legal pages live on the backend, so the new language's copies have to be
    // pulled - the bundled strings switch instantly but Terms would otherwise
    // stay in the old language until the next sync. Not awaited: it is a
    // background refresh and the picker should close immediately.
    refreshContentForCurrentLocale();
    if (needsRestart) {
      // An app that vanishes and comes back is indistinguishable from a crash
      // if nobody said it was going to happen, and this is the only place in
      // the app that does it. Say what is about to happen and let them back
      // out - the language is already applied either way, so Cancel simply
      // leaves the flip until the next launch rather than losing the choice.
      Alert.alert(
        t('settings.restartRequired'),
        t('settings.rtlRestartConfirm', {
          language: SUPPORTED_LANGUAGES[tag] ?? tag,
        }),
        [
          { text: t('settings.cancel'), style: 'cancel', onPress: onClose },
          { text: t('settings.restartNow'), onPress: restartNow },
        ],
      );
      return;
    }
    onClose();
  };

  const dismissRestart = () => {
    setRestartNeeded(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('settings.language')}</Text>

          {restartNeeded ? (
            <View style={styles.restart}>
              <Text style={styles.restartTitle}>{t('settings.restartRequired')}</Text>
              <Text style={styles.restartBody}>{t('settings.restartBody')}</Text>
              <TouchableOpacity
                style={styles.restartBtn}
                accessibilityRole="button"
                onPress={dismissRestart}
              >
                <Text style={styles.restartBtnText}>{t('settings.gotIt')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // One language out of 29, which is a radio group. The tick beside
            // the current one is drawn but was announced as nothing, so a
            // screen reader met 29 identical buttons with no way to tell which
            // language was already in force.
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              accessibilityRole="radiogroup"
            >
              {tags.map((tag, index) => (
                <TouchableOpacity
                  key={tag}
                  style={[styles.row, index > 0 && styles.rowBorder]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: tag === current, checked: tag === current }}
                  accessibilityLabel={SUPPORTED_LANGUAGES[tag]}
                  onPress={() => choose(tag)}
                >
                  <Text style={styles.rowText}>{SUPPORTED_LANGUAGES[tag]}</Text>
                  {tag === current ? (
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M20 6L9 17l-5-5"
                        stroke={COLORS.accentText}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {restartNeeded ? null : (
            <TouchableOpacity
              style={styles.closeBtn}
              accessibilityRole="button"
              onPress={onClose}
            >
              <Text style={styles.closeBtnText}>{t('settings.cancel')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingBottom: 20,
    // The list is long; cap it so the sheet never swallows the whole screen.
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.whiteFaint,
  },
  title: {
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 20,
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  list: {
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 15,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.white,
  },
  closeBtn: {
    marginTop: 10,
    marginHorizontal: 20,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  restart: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 4,
  },
  restartTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  restartBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.whiteMuted,
  },
  restartBtn: {
    marginTop: 18,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restartBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
});
