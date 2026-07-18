import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator, BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
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
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { LegalPageScreen } from '../screens/settings/LegalPageScreen';
import { ExerciseDetailScreen } from '../screens/exercise/ExerciseDetailScreen';
import { AllExercisesScreen } from '../screens/exercise/AllExercisesScreen';
import { KnowledgeScreen } from '../screens/knowledge/KnowledgeScreen';
import { KnowledgeLessonScreen } from '../screens/knowledge/KnowledgeLessonScreen';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformPressable } from '@react-navigation/elements';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { COLORS } from '../theme/colors';

export type RootStackParamList = {
  MainTabs: undefined;
  Workout: { trialSlug?: string };
  WorkoutComplete: { duration: number; levelId: number };
  Paywall: undefined;
  Settings: undefined;
  LegalPage: { slug: string; title: string };
  ExerciseDetail: { slug: string; unlocked: boolean; daysLeft: number };
  AllExercises: undefined;
  Knowledge: undefined;
  KnowledgeLesson: { slug: 'why' | 'find' | 'first'; index: number };
};

export type AuthStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Register: undefined;
  VerifyEmail: { email: string };
  Knowledge: { subscribe?: boolean } | undefined;
  KnowledgeLesson: { slug: 'why' | 'find' | 'first'; index: number };
};

const Stack = createStackNavigator<RootStackParamList>();
const AuthStack = createStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator();

// Tab bar icons - exact stroke glyphs from bottom-nav.blade.php.
const TabIcon = ({ name, color }: { name: string; color: string }) => {
  const s = {
    stroke: color,
    strokeWidth: 1.8,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'Training': // dumbbell
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" {...s} />
        </Svg>
      );
    case 'Progress': // bar chart
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Path d="M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-7" {...s} />
        </Svg>
      );
    case 'Schedule': // calendar
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Rect x={3} y={5} width={18} height={16} rx={3} {...s} />
          <Path d="M3 9h18M8 3v4M16 3v4" {...s} />
        </Svg>
      );
    case 'Profile': // person
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={8} r={4} {...s} />
          <Path d="M4 21c0-4 4-6 8-6s8 2 8 6" {...s} />
        </Svg>
      );
    default:
      return null;
  }
};

// Tab bar button: the press effect hugs the ICON only, never the label. A
// native ripple can't do that (its hotspot follows the finger anywhere in the
// tab slot), so it is hidden and a circle is drawn behind the icon while
// pressed instead.
const TabButton = ({ children, ...props }: BottomTabBarButtonProps) => {
  const [pressed, setPressed] = React.useState(false);
  return (
    <PlatformPressable
      {...props}
      pressColor="transparent"
      onPressIn={(e) => {
        setPressed(true);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        props.onPressOut?.(e);
      }}
    >
      {pressed && <View style={tabStyles.iconPress} />}
      {children}
    </PlatformPressable>
  );
};

const tabStyles = StyleSheet.create({
  // 40pt circle centered on the 31x28 icon box (the tab button has 5pt padding,
  // so the icon's vertical center sits 19pt from the button top).
  iconPress: {
    position: 'absolute',
    top: -1,
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});

const TabNavigator = () => {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        // Mount tabs on first visit only, and freeze (suspend re-rendering of)
        // blurred tabs so background tabs cost nothing while training.
        lazy: true,
        freezeOnBlur: true,
        tabBarIcon: ({ color }) => <TabIcon name={route.name} color={color} />,
        tabBarButton: (props) => <TabButton {...props} />,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
        tabBarStyle: {
          backgroundColor: '#0c0f17',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.1)',
          paddingTop: 8,
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

  if (!isAuthenticated) {
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
  if (!subscribed) {
    return (
      <Stack.Navigator key="paywall-gate" screenOptions={{ headerShown: false }} initialRouteName="Paywall">
        <Stack.Screen name="Paywall" component={PaywallScreen} />
        <Stack.Screen name="LegalPage" component={LegalPageScreen} />
      </Stack.Navigator>
    );
  }

  // Authenticated but not yet past "Learn the basics": hold the user on the
  // lessons. Only Knowledge + KnowledgeLesson are reachable, so there is no way
  // to slip into the app early. Finishing the last lesson flips basicsDone in
  // context, which swaps this navigator for the main app below - the transition
  // is driven by state, so it happens live, with no dashboard flash and without
  // needing to reopen the app.
  if (!basicsDone) {
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
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="LegalPage" component={LegalPageScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <Stack.Screen name="AllExercises" component={AllExercisesScreen} />
      <Stack.Screen name="Knowledge" component={KnowledgeScreen} />
      <Stack.Screen name="KnowledgeLesson" component={KnowledgeLessonScreen} />
    </Stack.Navigator>
  );
};
