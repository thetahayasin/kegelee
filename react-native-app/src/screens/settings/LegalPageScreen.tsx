import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { TouchableOpacity } from '../../components/Touchable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp, NavigationProp } from '@react-navigation/native';
import { Palette } from '../../theme/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { Chevron } from '../../components/Chevron';
import { HtmlRenderer } from '../../components/HtmlRenderer';
import { api } from '../../services/api';
import { savePage, getPageInLocale } from '../../db/queries';
import { Watermark } from '../../components/Watermark';

type RouteParams = {
  LegalPage: {
    slug: string;
    title: string;
  };
};

export const LegalPageScreen = () => {
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  const { t, i18n } = useTranslation();
  const route = useRoute<RouteProp<RouteParams, 'LegalPage'>>();
  const navigation = useNavigation<NavigationProp<any>>();

  const { slug, title } = route.params;
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  /**
   * Nothing cached and nothing fetched.
   *
   * This used to be written INTO the page as its body text, so the offline
   * notice arrived styled as the document the reader asked for, with no way to
   * try again short of leaving and coming back. It is a state, not content.
   */
  const [failed, setFailed] = useState(false);
  /**
   * Which kind of failure, from the api's own errorKey.
   *
   * "No content available offline" was said whatever went wrong, including a
   * 500 from a perfectly reachable server - which sends the reader off to
   * check a connection that is fine. 'network' is the only case that is
   * actually about being offline.
   */
  const [failKind, setFailKind] = useState<'offline' | 'other'>('other');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchPageContent = async () => {
      setLoading(true);
      setFailed(false);
      try {
        // Only a copy cached in the language being READ. The old query
        // matched on slug alone, so after a language change this found the
        // previous language's text and returned it - and the screen appeared
        // to correct itself only if you left and came back, by which time a
        // background content sync had overwritten the row underneath it.
        const cached = await getPageInLocale(slug, i18n.language);
        if (cancelled) return;
        if (cached) {
          setContent(cached);
        } else {
          // If not found in SQLite (e.g. offline before first sync), show fallback
          if (slug === 'about-basics') {
            // Was a hardcoded English template literal, so this page served
            // English to all 29 languages whenever the sync had not run - and
            // it is the page a reader is most likely to open before their
            // first sync. It is copy; copy lives in the locale files.
            setContent(t('legal.aboutBasics'));
          } else {
            // Nothing local yet. That is the NORMAL state for a signed-out
            // reader: `pages` is filled by the authenticated sync, so a guest
            // who reaches Terms from the subscribe sheet has an empty table
            // and used to be told the app was offline while it plainly was
            // not. /pages/{slug} needs no user token, so fetch it directly and
            // keep the copy for next time. The notice is now what it claims to
            // be - the genuinely-offline case.
            const remote = await api.pullPage(slug, i18n.language);
            if (cancelled) return;
            if (remote.ok && remote.data?.content) {
              setContent(remote.data.content);
              await savePage(
                {
                  slug,
                  title: remote.data.title || title,
                  content: remote.data.content,
                  sort_order: 0,
                  is_published: 1,
                },
                i18n.language,
              );
            } else {
              setContent('');
              setFailKind(remote.errorKey === 'network' ? 'offline' : 'other');
              setFailed(true);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load the legal page', e);
        if (!cancelled) {
          setContent('');
          // A throw is a local failure (the database, the cache write), not a
          // statement about the network.
          setFailKind('other');
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPageContent();
    return () => {
      cancelled = true;
    };
    // i18n.language included on purpose: the remote fetch is
    // language-specific, so switching language re-reads the page in the
    // new one instead of leaving the previous language's copy on screen.
    // `attempt` is what the Retry button bumps.
  }, [slug, title, i18n.language, t, attempt]);

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      {/* Title Row */}
      <View style={styles.titleRow}>
        <TouchableOpacity
          style={styles.backBtnInline}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => navigation.goBack()}
        >
          <Chevron direction="back" size={24} color={COLORS.textMuted} />
        </TouchableOpacity>
        <Text style={styles.pageTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : failed ? (
        <View style={styles.center}>
          <Text style={styles.offlineText}>
            {failKind === 'offline' ? t('common.offline') : t('common.couldNotLoad')}
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            accessibilityRole="button"
            onPress={() => setAttempt((n) => n + 1)}
          >
            <Text style={styles.retryBtnText}>{t('common.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <HtmlRenderer html={content} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  offlineText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: COLORS.textMuted,
  },
  retryBtn: {
    marginTop: 20,
    minHeight: 48,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.onAccent,
  },
  scrollContent: {
    padding: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  backBtnInline: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
    // flex, not a percentage guess: the back button beside it is a fixed
    // width, so the title should simply take what is left.
    flexShrink: 1,
  },
  bodyText: {
    fontSize: 15,
    color: COLORS.whiteMuted,
    lineHeight: 24,
  },
});
