import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AshaProvider, useAsha } from '../../features/asha/store/AshaContext';
import type { Lang } from '../../features/asha/types';
import { useLanguage } from '../../features/shared/i18n/useLanguage';
import { fontFamily, useTheme } from '../../features/shared/theme';

/** P3's AshaProvider reads its saved language from this key when it loads (store/AshaContext.tsx). */
const ASHA_LANG_KEY = 'asha.lang';

const ashaLangOf = (code: string): Lang => (code === 'hi' ? 'hi' : 'en');

function Loading() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.page }}>
      <ActivityIndicator size="large" color={theme.accent.accent} />
    </View>
  );
}

/**
 * The ASHA module follows the app language chosen in the shared session: Hindi when the app is in
 * Hindi, English for every other language (P3's strings exist in en + hi only). The first render
 * waits until the store has loaded and the language matches, so a screen never flashes in the
 * other language; later switches (from asha/profile) re-render in place.
 */
function AshaStack() {
  const theme = useTheme();
  const { language } = useLanguage();
  const { ready, lang, setLang } = useAsha();
  const target = ashaLangOf(language);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (lang !== target) setLang(target);
    else setSynced(true);
  }, [ready, lang, target, setLang]);

  if (!synced) return <Loading />;

  const titleFont = fontFamily[lang === 'hi' ? 'deva' : 'latn'].semibold;
  return (
    <Stack
      screenOptions={({ route }) => ({
        // Home draws its own pale sage hero; every other screen gets a light header with a back chevron.
        headerShown: route.name !== 'asha/index',
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: { fontFamily: titleFont, fontSize: theme.typography.title.size },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: theme.colors.page },
      })}
    />
  );
}

/** ASHA (P3) section. When P1's auth lands, pass the signed-in user: <AshaProvider user={user}>. */
export default function AshaLayout() {
  const { language } = useLanguage();
  const [primed, setPrimed] = useState(false);

  // Before the provider loads, store the app language as P3's saved language: the first frame and
  // the first-run demo data (alert texts are localized when seeded) then use the app language.
  useEffect(() => {
    AsyncStorage.setItem(ASHA_LANG_KEY, ashaLangOf(language))
      .catch(() => undefined)
      .finally(() => setPrimed(true));
    // Once, on entering the ASHA section; later switches go through AshaStack.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!primed) return <Loading />;
  return (
    <AshaProvider>
      <AshaStack />
    </AshaProvider>
  );
}
