import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import {
  colorSchemes,
  layout,
  motion,
  radii,
  roleAccentKey,
  roleAccents,
  shadows,
  sizes,
  space,
  textScale as textScaleTokens,
  typography,
  type AccentRole,
  type ColorTokens,
  type RoleAccent,
} from './tokens';

export type AppRole = 'patient' | 'asha' | 'doctor' | 'admin';

export type Theme = {
  role: AppRole;
  accentRole: AccentRole;
  colors: ColorTokens;
  accent: RoleAccent;
  highContrast: boolean;
  /** User text-size step (1, 1.15, 1.3, 1.5). Multiplied into every <Text> size. */
  textScale: number;
  /** 'blur' (iOS/web), 'tint' (Android: translucent fill, no blur), 'solid' (high contrast). */
  glass: 'blur' | 'tint' | 'solid';
  radii: typeof radii;
  space: typeof space;
  layout: typeof layout;
  sizes: typeof sizes;
  shadows: typeof shadows;
  typography: typeof typography;
  motion: typeof motion;
  /** CSS gradient string for RN's backgroundImage style prop (flat colour in high contrast). */
  gradient: (stops: readonly string[], locations?: readonly number[], angle?: string) => string;
};

type ThemeSettings = {
  highContrast: boolean;
  textScale: number;
  setHighContrast: (value: boolean) => void;
  setTextScale: (value: number) => void;
};

export function linearGradient(
  stops: readonly string[],
  locations?: readonly number[],
  angle = '180deg'
): string {
  const parts = stops.map((c, i) =>
    locations?.[i] !== undefined ? `${c} ${Math.round(locations[i] * 100)}%` : c
  );
  return `linear-gradient(${angle}, ${parts.join(', ')})`;
}

export function buildTheme(role: AppRole, highContrast: boolean, textScale: number): Theme {
  const scheme = highContrast ? 'highContrast' : 'standard';
  const accentRole = roleAccentKey[role];
  return {
    role,
    accentRole,
    colors: colorSchemes[scheme],
    accent: roleAccents[scheme][accentRole],
    highContrast,
    textScale,
    glass: highContrast ? 'solid' : Platform.OS === 'android' ? 'tint' : 'blur',
    radii,
    space,
    layout,
    sizes,
    shadows,
    typography,
    motion,
    gradient: (stops, locations, angle) =>
      highContrast || stops.length < 2 ? (stops[0] ?? 'transparent') : linearGradient(stops, locations, angle),
  };
}

const defaultSettings: ThemeSettings = {
  highContrast: false,
  textScale: textScaleTokens.default,
  setHighContrast: () => {},
  setTextScale: () => {},
};

const ThemeContext = createContext<Theme>(buildTheme('patient', false, textScaleTokens.default));
const SettingsContext = createContext<ThemeSettings>(defaultSettings);
const RoleOverrideContext = createContext<AppRole | null>(null);

/**
 * Root theme provider. `role` comes from the current route group (the root layout maps
 * useSegments()[0] to a role), so teammates never pass it. High contrast and text scale live in
 * provider state for now; the Phase B settings screen calls useThemeSettings().setX.
 */
const SETTINGS_KEY = 'aroghya-a11y-v1';

export function ThemeProvider({ role, children }: { role: AppRole; children: ReactNode }) {
  const [highContrast, setHighContrastState] = useState(false);
  const [textScale, setTextScaleState] = useState<number>(textScaleTokens.default);

  // Accessibility settings survive restarts (high contrast, text size). Reads are best-effort.
  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { highContrast?: boolean; textScale?: number };
        if (typeof saved.highContrast === 'boolean') setHighContrastState(saved.highContrast);
        if (typeof saved.textScale === 'number' && (textScaleTokens.steps as readonly number[]).includes(saved.textScale)) setTextScaleState(saved.textScale);
      })
      .catch(() => undefined);
  }, []);
  const persist = (next: { highContrast: boolean; textScale: number }) => {
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => undefined);
  };
  const setHighContrast = (value: boolean) => {
    setHighContrastState(value);
    persist({ highContrast: value, textScale });
  };
  const setTextScale = (value: number) => {
    setTextScaleState(value);
    persist({ highContrast, textScale: value });
  };
  const theme = useMemo(() => buildTheme(role, highContrast, textScale), [role, highContrast, textScale]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const settings = useMemo(() => ({ highContrast, textScale, setHighContrast, setTextScale }), [highContrast, textScale]);
  return (
    <SettingsContext.Provider value={settings}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </SettingsContext.Provider>
  );
}

/** Override the role accent for a subtree (e.g. each role card in the picker, admin screens). */
export function RoleScope({ role, children }: { role: AppRole; children: ReactNode }) {
  return <RoleOverrideContext.Provider value={role}>{children}</RoleOverrideContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  const override = useContext(RoleOverrideContext);
  return useMemo(
    () => (override && override !== theme.role ? buildTheme(override, theme.highContrast, theme.textScale) : theme),
    [override, theme]
  );
}

export function useThemeSettings(): ThemeSettings {
  return useContext(SettingsContext);
}

/** Maps the first route segment to the role whose accent the screen uses. */
export function roleFromSegment(segment: string | undefined, fallback: AppRole | null): AppRole {
  if (segment === '(patient)') return 'patient';
  if (segment === '(asha)') return 'asha';
  if (segment === '(doctor)') return fallback === 'admin' ? 'admin' : 'doctor';
  return fallback ?? 'patient';
}
