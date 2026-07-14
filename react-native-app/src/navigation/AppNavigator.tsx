import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { LegalPageScreen } from '../screens/settings/LegalPageScreen';
import { ExerciseDetailScreen } from '../screens/exercise/ExerciseDetailScreen';
import { AllExercisesScreen } from '../screens/exercise/AllExercisesScreen';
import { KnowledgeScreen } from '../screens/knowledge/KnowledgeScreen';
import { KnowledgeLessonScreen } from '../screens/knowledge/KnowledgeLessonScreen';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { COLORS } from '../theme/colors';

export type RootStackParamList = {
  MainTabs: undefined;
  Workout: { trialSlug?: string };
  WorkoutComplete: { duration: number; levelId: number };
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
  Knowledge: undefined;
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
  const { isAuthenticated, onboarded, setOnboarded, user } = useAuth();

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

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={user?.onboarded ? 'MainTabs' : 'Knowledge'}
    >
      <Stack.Screen name="MainTabs" component={TabNavigator} />
      <Stack.Screen name="Workout" component={WorkoutScreen} />
      <Stack.Screen name="WorkoutComplete" component={WorkoutCompleteScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="LegalPage" component={LegalPageScreen} />
      <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
      <Stack.Screen name="AllExercises" component={AllExercisesScreen} />
      <Stack.Screen name="Knowledge" component={KnowledgeScreen} />
      <Stack.Screen name="KnowledgeLesson" component={KnowledgeLessonScreen} />
    </Stack.Navigator>
  );
};
