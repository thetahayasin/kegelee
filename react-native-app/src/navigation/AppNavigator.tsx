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
import { appPhase } from './phase';
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
import { FreeSessionCompleteScreen } from '../screens/workout/FreeSessionCompleteScreen';
import { FreeSessionOfferScreen } from '../screens/workout/FreeSessionOfferScreen';
import { ExerciseDetailScreen } from '../screens/exercise/ExerciseDetailScreen';
import { AllExercisesScreen } from '../screens/exercise/AllExercisesScreen';
import { KnowledgeScreen } from '../screens/knowledge/KnowledgeScreen';
import { KnowledgeLessonScreen } from '../screens/knowledge/KnowledgeLessonScreen';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformPressable } from '@react-navigation/elements';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { COLORS, RADIUS } from '../theme/colors';

export type RootStackParamList = {
  MainTabs: undefined;
  // freeSession belongs here too: the subscription gate below mounts Workout
  // and dispatches it with { freeSession: true }, so declaring it only on the
  // guest stack made the gate's own free session an untyped route.
  Workout: { trialSlug?: string; freeSession?: boolean };
  WorkoutComplete: { duration: number; levelId: number };
  Paywall: undefined;
  LegalPage: { slug: string; title: string };
  ExerciseDetail: { slug: string; unlocked: boolean; daysLeft: number };
  AllExercises: undefined;
  Knowledge: { subscribe?: boolean } | undefined;
  KnowledgeLesson: { slug: 'why' | 'find' | 'first'; index: number };
  // Reachable for a signed-in account that has not subscribed yet: the paywall
  // dismisses into the same funnel a guest gets.
  FreeSessionOffer: undefined;
  FreeSessionComplete: { duration: number };
};

export type AuthStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  VerifyEmail: { email: string };
  Knowledge: { subscribe?: boolean } | undefined;
  KnowledgeLesson: { slug: 'why' | 'find' | 'first'; index: number };
  LegalPage: { slug: string; title: string };
  FreeSessionOffer: undefined;
  Workout: { freeSession?: boolean };
  FreeSessionComplete: { duration: number };
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

const styles = StyleSheet.create({
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
});

const TAB_LABEL_KEYS: Record<string, string> = {
  Training: 'tabs.training',
  Progress: 'tabs.progress',
  Schedule: 'tabs.schedule',
  Profile: 'tabs.profile',
};

const TabNavigator = () => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        // Mount tabs on first visit only, and freeze (suspend re-rendering of)
        // blurred tabs so background tabs cost nothing while training.
        lazy: true,
        freezeOnBlur: true,
        // Without this the tab bar renders the route name verbatim.
        tabBarLabel: t(TAB_LABEL_KEYS[route.name] ?? route.name),
        tabBarIcon: ({ color, focused }) => (
          <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
            <TabIcon name={route.name} color={color} focused={focused} />
          </View>
        ),
        // Not the design branch's compact ripple: bounding the circle to
        // radius 28 shrinks the flare, it does not remove it, and the flare is
        // what was reported. The capsule above already carries the state.
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textDim,
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontWeight: '600',
          letterSpacing: 0.1,
          marginTop: 2,
        },
        tabBarStyle: {
          backgroundColor: COLORS.navBar,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          paddingTop: 6,
          // Grow the bar by the bottom inset so it clears the Android nav bar
          // instead of sitting underneath it (edge-to-edge on targetSdk 36).
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
        },
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
  const { isAuthenticated, onboarded, setOnboarded, basicsDone, subscribed } = useAuth();
  // The SAME function App.tsx keys the NavigationContainer with. When these
  // two disagreed, a purchase swapped the stack while the container replayed
  // the Paywall route into it - see navigation/phase.
  const phase = appPhase({ isAuthenticated, subscribed, basicsDone });

  if (phase === 'guest') {
    // Guests share ONE stack. New guests start on the onboarding slides; once
    // onboarding is done they land on Learn the basics (Knowledge) as the root,
    // mirroring the web guest funnel (onboarding -> dismiss -> knowledge.index).
    // Login / Register sit on top of the basics and close back down to them.
    return (
      <AuthStack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={onboarded ? 'Login' : 'Onboarding'}
      >
        <AuthStack.Screen name="Onboarding">
          {() => <OnboardingScreen onComplete={() => setOnboarded(true)} />}
        </AuthStack.Screen>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Register" component={RegisterScreen} />
        <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        <AuthStack.Screen name="Knowledge" component={KnowledgeScreen} />
        <AuthStack.Screen name="KnowledgeLesson" component={KnowledgeLessonScreen} />
        {/* The guest subscribe sheet's legal footnote opens Terms and the
            Privacy Policy. Without this screen here the sheet had nowhere in
            the app to send a signed-out reader, so it handed them to the
            system browser - the paywall shows the same pages in-app once you
            are signed in. Reads from the synced `pages` table, so it needs no
            session. */}
        <AuthStack.Screen name="LegalPage" component={LegalPageScreen} />
        {/* The one free session a guest gets, offered at the end of the basics.
            The funnel previously went from the last lesson straight to the
            plans sheet, asking for money from someone who had never used the
            app - and leaving the first lesson's promise of "then you do your
            first real exercise" unkept. Both screens are guest-safe: the
            workout builds day one of level 1 without touching an account, and
            the completion screen is its own rather than the account-keyed
            one. */}
        <AuthStack.Screen name="FreeSessionOffer" component={FreeSessionOfferScreen} />
        <AuthStack.Screen name="Workout" component={WorkoutScreen} />
        <AuthStack.Screen name="FreeSessionComplete" component={FreeSessionCompleteScreen} />
      </AuthStack.Navigator>
    );
  }

  // Signed in without an active subscription: the paywall IS the app - the
  // only screens reachable are the subscription plans (plus the Terms page its
  // legal footnote links to), and the only ways out are purchasing a plan or
  // the paywall's own Log out escape hatch. This mirrors the web, where the
  // EnsureSubscribed middleware makes /upgrade the sole route for a signed-up,
  // unsubscribed user - and it runs BEFORE the basics gate, matching the web
  // route middleware order ['subscribed', 'basics']. Purchasing (or a sync
  // revealing a subscription) flips `subscribed` in context, which swaps this
  // navigator away live; admins bypass the gate inside the context compute.
  if (phase === 'paywall') {
    return (
      <Stack.Navigator key="paywall-gate" screenOptions={{ headerShown: false }} initialRouteName="Paywall">
        <Stack.Screen name="Paywall" component={PaywallScreen} />
        <Stack.Screen name="LegalPage" component={LegalPageScreen} />
        {/* The paywall opens the stack but is no longer the whole of it.
            A new account used to land on a price with nothing behind it and no
            way past - asked to pay for something they had not seen, which is
            the weakest possible moment to ask and loses the ones who would
            have converted after using it. Dismissing the paywall now drops
            into the same funnel a guest gets: the basics, then the free
            session, then the ask again on the back of having actually trained.
            Nothing here is reachable without an account, and none of it needs
            a subscription. */}
        <Stack.Screen name="Knowledge" component={KnowledgeScreen} />
        <Stack.Screen name="KnowledgeLesson" component={KnowledgeLessonScreen} />
        <Stack.Screen name="FreeSessionOffer" component={FreeSessionOfferScreen} />
        <Stack.Screen name="Workout" component={WorkoutScreen} />
        <Stack.Screen name="FreeSessionComplete" component={FreeSessionCompleteScreen} />
      </Stack.Navigator>
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
      {/* "Manage Plan": subscribed users (and gate-bypassing admins) reach the
          paywall from Settings to switch plans with Play's native proration. */}
      <Stack.Screen name="Paywall" component={PaywallScreen} />
      <Stack.Screen name="LegalPage" component={LegalPageScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <Stack.Screen name="AllExercises" component={AllExercisesScreen} />
      <Stack.Screen name="Knowledge" component={KnowledgeScreen} />
      <Stack.Screen name="KnowledgeLesson" component={KnowledgeLessonScreen} />
    </Stack.Navigator>
  );
};
