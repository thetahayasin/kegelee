import React from 'react';
import { useTranslation } from 'react-i18next';
// Native stack, not the JS one. @react-navigation/stack animates transitions on
// the JS thread, so every push competed with whatever the incoming screen was
// doing on mount - and several screens run SQLite reads on focus, which is
// exactly when the animation is playing. native-stack hands the transition to
// react-native-screens (already a dependency) so it runs off the JS thread.
// Only headerShown was ever set, so nothing else had to change.
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { appPhase, guestInitialRoute } from './phase';
import { OnboardingScreen } from '../screens/auth/OnboardingScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { VerifyEmailScreen } from '../screens/auth/VerifyEmailScreen';

import { TrainingScreen } from '../screens/tabs/TrainingScreen';
import { ProgressScreen } from '../screens/tabs/ProgressScreen';
import { ScheduleScreen } from '../screens/tabs/ScheduleScreen';
import { ProfileScreen } from '../screens/tabs/ProfileScreen';

import { WorkoutScreen } from '../screens/workout/WorkoutScreen';
import { WorkoutCompleteScreen } from '../screens/workout/WorkoutCompleteScreen';
import { PaywallScreen } from '../screens/paywall/PaywallScreen';
import { LegalPageScreen } from '../screens/settings/LegalPageScreen';
import { ExerciseDetailScreen } from '../screens/exercise/ExerciseDetailScreen';
import { AllExercisesScreen } from '../screens/exercise/AllExercisesScreen';
import { KnowledgeScreen } from '../screens/knowledge/KnowledgeScreen';
import { KnowledgeLessonScreen } from '../screens/knowledge/KnowledgeLessonScreen';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformPressable } from '@react-navigation/elements';
import { StyleSheet, View, Text, useWindowDimensions } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { RADIUS, SPACE, TAB_BAR, Palette } from '../theme/colors';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

export type RootStackParamList = {
  MainTabs: undefined;
  Workout: { trialSlug?: string };
  WorkoutComplete: { duration: number; levelId: number };
  /**
   * `source` records WHERE the subscribe ask was raised from.
   *
   * Every one of these is a different sentence put in front of a different
   * person - a padlocked exercise, the difficulty picker, the reminders row,
   * the measure card, the end of a session, the free day cap on the home
   * screen, or a deliberate visit to Settings. Which of them actually sells is
   * the most useful thing this screen can report, and without the param they
   * all arrived as the same anonymous view.
   *
   * Still optional: the Paywall is also reachable from a deep link and from
   * places with nothing to distinguish, and those are read as 'direct'.
   */
  Paywall:
    | {
        source?:
          | 'difficulty'
          | 'reminders'
          | 'measure'
          | 'exercise'
          | 'settings'
          | 'complete'
          | 'training'
          | 'renew';
      }
    | undefined;
  LegalPage: { slug: string; title: string };
  ExerciseDetail: { slug: string; unlocked: boolean; daysLeft: number };
  AllExercises: undefined;
  Knowledge: { subscribe?: boolean } | undefined;
  KnowledgeLesson: { slug: 'why' | 'find' | 'first'; index: number };
};

export type AuthStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  VerifyEmail: { email: string };
  Knowledge: { subscribe?: boolean } | undefined;
  KnowledgeLesson: { slug: 'why' | 'find' | 'first'; index: number };
  LegalPage: { slug: string; title: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator();

// Tab bar icons - exact stroke glyphs from bottom-nav.blade.php.
const TabIcon = ({ name, color, focused }: { name: string; color: string; focused: boolean }) => {
  const s = {
    stroke: color,
    // The active tab thickens its glyph, so the state is carried by weight as
    // well as by the capsule behind it - not by colour alone.
    strokeWidth: focused ? 2.3 : 1.8,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'Training': // dumbbell
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" {...s} />
        </Svg>
      );
    case 'Progress': // bar chart
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7" {...s} />
        </Svg>
      );
    case 'Schedule': // calendar
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Rect x={3} y={5} width={18} height={16} rx={3} {...s} />
          <Path d="M3 9h18M8 3v4M16 3v4" {...s} />
        </Svg>
      );
    case 'Profile': // person
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={8} r={4} {...s} />
          <Path d="M4 21c0-4 4-6 8-6s8 2 8 6" {...s} />
        </Svg>
      );
    default:
      return null;
  }
};

// Tab bar button.
const TabButton = ({ children, ...props }: BottomTabBarButtonProps) => (
  // No press effect at all on the tab bar. The tint change between active and
  // inactive already signals the result of the tap.
  //
  // pressColor alone was NOT enough: it only tints the Android ripple, so the
  // ripple was still drawn - and PlatformPressable's default is borderless,
  // which bleeds a circle out past the icon. That is the flare. radius 0 with
  // borderless false stops it being drawn, and pressOpacity 1 stops the
  // non-ripple fallback (older Android, web) fading the whole tab instead.
  <PlatformPressable
    {...props}
    pressColor="transparent"
    pressOpacity={1}
    android_ripple={{ color: 'transparent', borderless: false, radius: 0 }}
  >
    {children}
  </PlatformPressable>
);

const makeStyles = (COLORS: Palette) => StyleSheet.create({
  // Capsule behind the active glyph. Adds shape as a second channel so the
  // active tab is not signalled by colour alone.
  tabIconWrap: {
    width: 52,
    height: 30,
    borderRadius: RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: {
    backgroundColor: COLORS.accentWash,
  },
  // Was tabBarLabelStyle; it moved here when the label became a rendered
  // element so it could be told to fit the tab.
  tabLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.1,
    marginTop: 2,
    textAlign: 'center',
  },
});

const TAB_LABEL_KEYS: Record<string, string> = {
  Training: 'tabs.training',
  Progress: 'tabs.progress',
  Schedule: 'tabs.schedule',
  Profile: 'tabs.profile',
};

const TabNavigator = () => {
  const insets = useSafeAreaInsets();
  const { width: winWidth } = useWindowDimensions();
  const { t } = useTranslation();
  // Four tabs and the bar's own padding - and never wider than the window
  // will allow with a gutter, which is what keeps it sane on a small phone.
  const barWidth = Math.min(
    TAB_BAR.itemWidth * 4 + SPACE.xs * 2,
    winWidth - SPACE.xl * 2,
  );
  const barInset = Math.max(SPACE.md, Math.round((winWidth - barWidth) / 2));
  const styles = useThemedStyles(makeStyles);
  const COLORS = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        // Mount tabs on first visit only, and freeze (suspend re-rendering of)
        // blurred tabs so background tabs cost nothing while training.
        lazy: true,
        freezeOnBlur: true,
        // Without this the tab bar renders the route name verbatim.
        //
        // Rendered rather than passed as a string, because the tab is a fixed
        // width now and the label has to be made to fit it. A plain string
        // gets the library's own Text, which will happily lay a long
        // translation out past the tab and into its neighbour.
        tabBarLabel: ({ color }) => (
          <Text
            style={[styles.tabLabel, { color }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            maxFontSizeMultiplier={1.2}
          >
            {t(TAB_LABEL_KEYS[route.name] ?? route.name)}
          </Text>
        ),
        tabBarIcon: ({ color, focused }) => (
          <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
            <TabIcon name={route.name} color={color} focused={focused} />
          </View>
        ),
        // Not the design branch's compact ripple: bounding the circle to
        // radius 28 shrinks the flare, it does not remove it, and the flare is
        // what was reported. The capsule above already carries the state.
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarActiveTintColor: COLORS.accentText,
        tabBarInactiveTintColor: COLORS.textDim,
        // A floating bar rather than a docked one.
        //
        // Docked, it was a full-width slab welded to the bottom of every
        // screen, and the only thing separating it from the content was a one
        // pixel line. Lifted off all three edges it reads as a control that
        // sits ON the app instead of a wall the app stops at, the content
        // scrolls visibly past underneath it, and the rounded ends match the
        // pills and cards used everywhere else in the app.
        //
        // Absolutely positioned, so it no longer takes part in the layout:
        // screens run the full height of the window behind it and pad
        // themselves by tabBarClearance() instead. Both sides read TAB_BAR.
        tabBarStyle: {
          position: 'absolute',
          /**
           * START and END, not left/right, and not alignSelf.
           *
           * Four attempts failed here for one reason, and it is worth writing
           * down: the library's own base style sets `start: 0, end: 0` - the
           * LOGICAL direction properties. Overriding `left` and `right` never
           * touched them, so the width stayed fully determined and the bar
           * stretched no matter what number went in. `alignSelf` could not
           * help either, because a box with both edges pinned has no freedom
           * left to align.
           *
           * So the same two properties the library uses are set here, to the
           * inset that centres a bar of exactly barWidth. Nothing is left to
           * infer: the width is arithmetic.
           */
          start: barInset,
          end: barInset,
          // Above the Android nav bar / home indicator, never behind it, and
          // never flush against the screen edge on a phone that has neither.
          bottom: Math.max(insets.bottom, TAB_BAR.gap),
          height: TAB_BAR.height,
          paddingTop: 8,
          paddingBottom: 8,
          paddingHorizontal: SPACE.xs,
          borderRadius: RADIUS.pill,
          backgroundColor: COLORS.navBar,
          // The docked bar's hairline was the boundary between bar and
          // content. A floating one is bounded on all four sides instead.
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: COLORS.border,
          // Lift. Without it the bar reads as a shape painted on the page
          // rather than an object above it, and on a dark background the
          // rounded ends alone are not enough to say which is on top.
          elevation: 16,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 10 },
        },
        // A fixed width per tab, so the bar hugs its content WITHOUT the four
        // tabs coming out different sizes. Left to size themselves they would
        // each be as wide as their own label, which differs per word and per
        // language - "Profile" against "Fortschritt" - and an evenly spaced
        // row is the one thing a tab bar has to be.
        //
        // Round the pressable to the bar, so a press near the ends cannot
        // paint a square corner outside it.
        tabBarItemStyle: { width: TAB_BAR.itemWidth, borderRadius: RADIUS.pill },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Training" component={TrainingScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

export const AppNavigator = () => {
  const { isAuthenticated, onboarded, setOnboarded, basicsDone } = useAuth();
  // The SAME function App.tsx keys the NavigationContainer with. When these
  // two disagreed, a purchase swapped the stack while the container replayed
  // the Paywall route into it - see navigation/phase.
  const phase = appPhase({ isAuthenticated, basicsDone });

  if (phase === 'guest') {
    // Guests share ONE stack. New guests start on the onboarding slides; once
    // onboarding is done they land on Learn the basics (Knowledge) as the root,
    // mirroring the web guest funnel (onboarding -> dismiss -> knowledge.index).
    // Login / Register sit on top of the basics and close back down to them.
    //
    // That is what this comment always said, and for a while it was not what
    // the code did - the root was 'Login', so every launch after the first put
    // a sign-in wall in front of a guest who was supposed to be reading the
    // lessons. The decision moved to navigation/phase, where it is a pure
    // function with a test, because a comment cannot fail a build.
    return (
      <AuthStack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={guestInitialRoute(onboarded)}
      >
        <AuthStack.Screen name="Onboarding">
          {() => <OnboardingScreen onComplete={() => setOnboarded(true)} />}
        </AuthStack.Screen>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
        <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        <AuthStack.Screen name="Knowledge" component={KnowledgeScreen} />
        <AuthStack.Screen name="KnowledgeLesson" component={KnowledgeLessonScreen} />
        {/* Terms and the Privacy Policy, reachable before there is a session.
            Reads from the synced `pages` table, so it needs no account.

            No Workout route here any more. A guest cannot train at all now:
            the demo session is gone, and the free tier lives behind sign-in
            rather than in front of it. The lessons are what a guest gets, and
            the way on from them is to create an account. */}
        <AuthStack.Screen name="LegalPage" component={LegalPageScreen} />
      </AuthStack.Navigator>
    );
  }

  // Authenticated but not yet past "Learn the basics": hold the user on the
  // lessons. Only Knowledge + KnowledgeLesson are reachable, so there is no way
  // to slip into the app early. Finishing the last lesson flips basicsDone in
  // context, which swaps this navigator for the main app below - the transition
  // is driven by state, so it happens live, with no dashboard flash and without
  // needing to reopen the app.
  if (phase === 'gate') {
    return (
      // key: this branch and the main stack below render the SAME Stack.Navigator
      // component type, so without distinct keys React updates the mounted
      // navigator in place when basicsDone flips - and React Navigation then
      // keeps its current state (KnowledgeLesson exists in both screen sets;
      // initialRouteName only applies on first mount), leaving the user stuck on
      // the finished lesson. Distinct keys force a remount, which is what
      // actually swaps to MainTabs the moment the basics are completed.
      <Stack.Navigator key="basics-gate" screenOptions={{ headerShown: false }} initialRouteName="Knowledge">
        <Stack.Screen name="Knowledge" component={KnowledgeScreen} />
        <Stack.Screen name="KnowledgeLesson" component={KnowledgeLessonScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator
      key="main-app"
      screenOptions={{ headerShown: false }}
      initialRouteName="MainTabs"
    >
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen name="Workout" component={WorkoutScreen} />
      <Stack.Screen name="WorkoutComplete" component={WorkoutCompleteScreen} />
      {/* "Manage Plan" from Settings, and the way in from every padlock: the
          locked tabs, the level row, the exercises past the free three and the
          notice after a free session all push this screen. */}
      <Stack.Screen name="Paywall" component={PaywallScreen} />
      <Stack.Screen name="LegalPage" component={LegalPageScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <Stack.Screen name="AllExercises" component={AllExercisesScreen} />
      <Stack.Screen name="Knowledge" component={KnowledgeScreen} />
      <Stack.Screen name="KnowledgeLesson" component={KnowledgeLessonScreen} />
    </Stack.Navigator>
  );
};
