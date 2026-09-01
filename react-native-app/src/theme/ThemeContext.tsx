import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK, LIGHT, Palette } from './colors';

/**
 * Appearance.
 *
 * Three settings, not two. "System" is the default and the one most people
 * want - the phone already knows whether it is night - but it must be a real
 * third option rather than the absence of a choice, because someone who wants
 * the app light while their phone is dark has to be able to say so, and a
 * two-way toggle cannot express "follow the phone" once it has been touched.
 *
 * The stored value is the MODE, never the resolved palette. Storing "dark"
 * because the phone happened to be dark the day the setting was saved would
 * silently pin the app, and the reader would have no way to tell a deliberate
 * choice from a stale one.
 */
export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = '@theme_mode';

const isMode = (v: unknown): v is ThemeMode =>
  v === 'system' || v === 'light' || v === 'dark';

interface ThemeValue {
  /** The live palette. */
  palette: Palette;
  /** What the reader chose. */
  mode: ThemeMode;
  /** What that resolves to right now. */
  scheme: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // null while the stored preference is still being read. Rendering the app in
  // the wrong appearance for a frame and then flipping it is worse than the
  // splash staying up a moment longer, so the tree waits.
  const [mode, setModeState] = useState<ThemeMode | null>(null);
  const systemScheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        setModeState(isMode(raw) ? raw : 'system');
      })
      .catch(() => {
        if (!cancelled) setModeState('system');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    // Applied immediately, persisted in the background: a failed write must
    // never make the control appear to do nothing.
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const resolved = mode ?? 'system';
    // useColorScheme returns null when the platform will not say. Dark is the
    // app's own default, and the one every screenshot and the splash screen
    // were designed against, so an unknown system preference lands there.
    const scheme: 'light' | 'dark' =
      resolved === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : resolved;
    return {
      palette: scheme === 'light' ? LIGHT : DARK,
      mode: resolved,
      scheme,
      setMode,
    };
  }, [mode, systemScheme, setMode]);

  if (mode === null) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

const useThemeValue = (): ThemeValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
};

/** The live palette. The common case by a wide margin. */
export const useTheme = (): Palette => useThemeValue().palette;

/** For the setting itself, and for anything that needs the resolved scheme. */
export const useThemeMode = (): Omit<ThemeValue, 'palette'> => {
  const { mode, scheme, setMode } = useThemeValue();
  return { mode, scheme, setMode };
};

/**
 * Build a screen's stylesheet against the live palette.
 *
 * Every screen declares its styles as `makeStyles = (COLORS: Palette) =>
 * StyleSheet.create({...})` and calls this. The factory is a module-scope
 * constant, so its identity is stable and the memo only recomputes when the
 * palette actually changes - which is to say twice in a session at most, not
 * on every render.
 *
 * The parameter is named COLORS on purpose. It shadows nothing and it meant
 * the ~670 `COLORS.x` references already written across the app did not have
 * to be touched to become theme-aware.
 */
export const useThemedStyles = <T,>(factory: (palette: Palette) => T): T => {
  const palette = useTheme();
  return useMemo(() => factory(palette), [factory, palette]);
};
