import React, { useState, useEffect } from 'react';
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
import { COLORS } from '../../theme/colors';
import { getDBConnection } from '../../db/sqlite';
import Svg, { Path } from 'react-native-svg';
import { HtmlRenderer } from '../../components/HtmlRenderer';
import { Watermark } from '../../components/Watermark';

type RouteParams = {
  LegalPage: {
    slug: string;
    title: string;
  };
};

export const LegalPageScreen = () => {
  const route = useRoute<RouteProp<RouteParams, 'LegalPage'>>();
  const navigation = useNavigation<NavigationProp<any>>();

  const { slug, title } = route.params;
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');

  useEffect(() => {
    const fetchPageContent = async () => {
      try {
        const db = await getDBConnection();
        const res = await db.executeSql(
          'SELECT content FROM pages WHERE slug = ? LIMIT 1',
          [slug]
        );
        if (res[0].rows.length > 0) {
          setContent(res[0].rows.item(0).content || '');
        } else {
          // If not found in SQLite (e.g. offline before first sync), show fallback
          if (slug === 'about-basics') {
            setContent(
              `Pelvic floor exercises (commonly called Kegels) strengthen the muscles supporting your bladder, bowels, and sexual function.

How to perform:
1. Identify the muscles: Contract the muscles you would use to stop urinating mid-stream.
2. Focus on contracting only your pelvic floor muscles. Avoid tightening your buttocks, thighs, or abdomen.
3. Keep breathing naturally throughout the exercise.

Consistency is key: Train daily for the best results.`
            );
          } else {
            setContent('No content available offline. Please connect to the internet to load this page.');
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchPageContent();
  }, [slug]);

  return (
    <SafeAreaView style={styles.container}>
      <Watermark />
      {/* Title Row */}
      <View style={styles.titleRow}>
        <TouchableOpacity style={styles.backBtnInline} onPress={() => navigation.goBack()}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M15 19l-7-7 7-7" stroke={COLORS.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.pageTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <HtmlRenderer html={content} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
    maxWidth: '80%',
  },
  bodyText: {
    fontSize: 15,
    color: COLORS.whiteMuted,
    lineHeight: 24,
  },
});
