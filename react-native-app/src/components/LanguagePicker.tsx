import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import RNRestart from 'react-native-restart';
import Svg, { Path } from 'react-native-svg';

import { TouchableOpacity } from './Touchable';
import { COLORS } from '../theme/colors';
import i18n, { LanguageTag, SUPPORTED_LANGUAGES, setLanguage } from '../i18n';
import { refreshContentForCurrentLocale } from '../services/sync';

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
  const { t } = useTranslation();
  const [restartNeeded, setRestartNeeded] = useState(false);

  const current = i18n.language as LanguageTag;
  const tags = Object.keys(SUPPORTED_LANGUAGES) as LanguageTag[];

  const choose = async (tag: LanguageTag) => {
    if (tag === current) {
      onClose();
      return;
    }
    const { needsRestart } = await setLanguage(tag);
    // Legal pages live on the backend, so the new language's copies have to be
    // pulled - the bundled strings switch instantly but Terms would otherwise
    // stay in the old language until the next sync. Not awaited: it is a
    // background refresh and the picker should close immediately.
    refreshContentForCurrentLocale();
    if (needsRestart) {
      // Switching between LTR and RTL flips the whole layout, and I18nManager
      // cannot do that to a running bundle - the change only lands on a fresh
      // one. Rather than leaving the user to close and reopen the app by hand
      // (which the previous build asked them to do, and which reads like a
      // failure), reload it for them. The language choice is already persisted
      // above, so the new bundle comes up in the right language and direction.
      //
      // A frame of delay lets AsyncStorage flush and the picker paint its
      // closing state, so the restart looks deliberate rather than like a
      // crash. If the native module is missing for any reason, fall back to
      // the old ask-the-user prompt instead of silently doing nothing.
      onClose();
      setTimeout(() => {
        try {
          RNRestart.restart();
        } catch {
          setRestartNeeded(true);
        }
      }, 250);
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
              <TouchableOpacity style={styles.restartBtn} onPress={dismissRestart}>
                <Text style={styles.restartBtnText}>{t('settings.gotIt')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {tags.map((tag, index) => (
                <TouchableOpacity
                  key={tag}
                  style={[styles.row, index > 0 && styles.rowBorder]}
                  onPress={() => choose(tag)}
                >
                  <Text style={styles.rowText}>{SUPPORTED_LANGUAGES[tag]}</Text>
                  {tag === current ? (
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M20 6L9 17l-5-5"
                        stroke={COLORS.accent}
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
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>{t('settings.cancel')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    borderTopColor: 'rgba(255,255,255,0.04)',
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
