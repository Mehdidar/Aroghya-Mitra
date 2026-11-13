// Importing the i18n module initialises i18next synchronously before any screen renders.
import '@/features/shared/i18n';

import { useFonts } from 'expo-font';
import { LocaleProvider, Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { startOutbox } from '@/features/shared/data/outbox';
import { FONT_FILES } from '@/features/shared/i18n/fonts';
import { applyLanguage, useLanguage } from '@/features/shared/i18n/useLanguage';
import { useSession } from '@/features/shared/state/session';
import { ThemeProvider, roleFromSegment, useTheme } from '@/features/shared/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * App shell (P1). Boot: fonts + persisted session -> apply language -> hide splash.
 * Then the role guard (Stack.Protected) shows exactly one route group:
 * no role -> (auth), patient -> (patient), asha -> (asha), doctor/admin -> (doctor).
 * Changing role (sign in / sign out) flips the guards and the stack moves to the allowed group.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const hasHydrated = useSession((s) => s.hasHydrated);
  const language = useSession((s) => s.language);
  const [languageReady, setLanguageReady] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    void applyLanguage(language).finally(() => setLanguageReady(true));
    // Only on boot: later switches go through useLanguage().setLanguage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  const ready = hasHydrated && languageReady && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);
  // Start sending queued record changes to the server (retries quietly while offline).
  useEffect(() => startOutbox(), []);

  // Rendering nothing until the role is known stops the guard flashing (auth) on launch.
  if (!ready) return null;
  return <Shell />;
}

function Shell() {
  const role = useSession((s) => s.role);
  const segments = useSegments();
  const { direction } = useLanguage();
  const themeRole = roleFromSegment(segments[0], role);
  const atAshaScreen = segments[0] === '(asha)' && (segments as string[])[1] === 'asha';

  // P3's (asha) group has no index route (its screens live under /asha), so the guard alone lands
  // on an unmatched "/(asha)": send a signed-in ASHA worker to /asha. Other groups have "/".
  useEffect(() => {
    if (role === 'asha' && !atAshaScreen) router.replace('/asha');
  }, [role, atAshaScreen]);

  return (
    <LocaleProvider direction={direction}>
      <ThemeProvider role={themeRole}>
        <Root direction={direction}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={role === null}>
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            <Stack.Protected guard={role === 'patient'}>
              <Stack.Screen name="(patient)" />
            </Stack.Protected>
            <Stack.Protected guard={role === 'asha'}>
              <Stack.Screen name="(asha)" />
            </Stack.Protected>
            <Stack.Protected guard={role === 'doctor' || role === 'admin'}>
              <Stack.Screen name="(doctor)" />
            </Stack.Protected>
            <Stack.Screen name="dev/components" options={{ headerShown: false }} />
          </Stack>
        </Root>
      </ThemeProvider>
    </LocaleProvider>
  );
}

/** Root view: `direction` flips start/end layout and natural text alignment with no reload. */
function Root({ direction, children }: { direction: 'ltr' | 'rtl'; children: ReactNode }) {
  const t = useTheme();
  const webDir = Platform.OS === 'web' ? ({ dir: direction } as object) : {};
  return (
    <View {...webDir} style={{ flex: 1, direction, backgroundColor: t.colors.page }}>
      {children}
    </View>
  );
}
