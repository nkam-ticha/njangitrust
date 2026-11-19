// Theme context: follows the system colour scheme unless the member overrides it.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { darkColors, lightColors, type ColorScheme, type ThemeColors } from './colors';

export type ThemePreference = 'system' | ColorScheme;

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<Theme | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  /** Starting preference, for example restored from the member's settings. */
  initialPreference?: ThemePreference;
}

export function ThemeProvider({ children, initialPreference = 'system' }: ThemeProviderProps) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const scheme: ColorScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const colors = scheme === 'dark' ? darkColors : lightColors;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.body) {
      document.body.style.backgroundColor = colors.canvas;
    }
  }, [colors.canvas]);

  const value = useMemo<Theme>(
    () => ({
      scheme,
      colors,
      preference,
      setPreference,
    }),
    [scheme, colors, preference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}
