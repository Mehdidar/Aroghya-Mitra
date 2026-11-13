import { Stack } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { Card, Muted, Screen } from '../../../features/asha/components/ui';
import { useAsha } from '../../../features/asha/store/AshaContext';
import type { Lang } from '../../../features/asha/types';
import { LANGUAGES } from '../../../features/shared/i18n/languages';
import { useLanguage } from '../../../features/shared/i18n/useLanguage';
import { useCurrentUser, useSession } from '../../../features/shared/state/session';
import { useTheme } from '../../../features/shared/theme';
import { Avatar, Icon, Pill, PrimaryButton, SecondaryButton, Text } from '../../../features/shared/ui';

const ASHA_LANGS: Lang[] = ['en', 'hi'];

/** ASHA profile menu (opened from the home hero): who is signed in, language, sync, sign out. */
export default function AshaProfile() {
  const theme = useTheme();
  const { user, lang, setLang, t, sync, syncNow, db } = useAsha();
  const session = useCurrentUser();
  const signOut = useSession((s) => s.signOut);
  const { setLanguage } = useLanguage();

  // The app language is the source of truth (the ASHA layout follows it); set both so the switch is instant.
  const choose = (code: Lang) => {
    setLang(code);
    void setLanguage(code);
  };

  const canSync = sync.kind !== 'local' && sync.kind !== 'syncing';
  const syncLabel =
    sync.kind === 'local'
      ? t('sync.noServer')
      : sync.kind === 'syncing'
        ? t('sync.running')
        : sync.kind === 'offline'
          ? t('sync.offline', { n: db.outbox.length })
          : sync.kind === 'error'
            ? t('sync.error')
            : db.outbox.length
              ? t('sync.waiting', { n: db.outbox.length })
              : t('sync.ok');

  return (
    <Screen footer={<PrimaryButton label={t('profile.signOut')} icon="log-out-outline" onPress={signOut} testID="sign-out" />} testID="screen-asha-profile">
      <Stack.Screen options={{ title: t('profile.title') }} />

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
          <Avatar name={user.name} size="lg" />
          <View style={{ flex: 1, gap: theme.space[1] }}>
            <Text variant="title">{user.name}</Text>
            {session?.phone ? (
              <Text variant="bodySmall" tone="secondary" numeric>
                {session.phone}
              </Text>
            ) : null}
            <Pill label={t('profile.role')} tone="accent" icon="medkit-outline" />
          </View>
        </View>
      </Card>

      <View style={{ gap: theme.space[3] }}>
        <Text variant="h3" accessibilityRole="header">
          {t('profile.language')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }} role="radiogroup">
          {ASHA_LANGS.map((code) => {
            const selected = code === lang;
            return (
              <Pressable
                key={code}
                role="radio"
                aria-checked={selected}
                accessibilityState={{ selected }}
                accessibilityLabel={`${LANGUAGES[code].native}, ${LANGUAGES[code].english}`}
                testID={`asha-lang-${code}`}
                onPress={() => choose(code)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space[2],
                  minHeight: theme.sizes.touchMin,
                  paddingHorizontal: theme.space[5],
                  borderRadius: theme.radii.full,
                  backgroundColor: selected ? theme.colors.chipActive : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.chipActive : theme.colors.border,
                }}
              >
                {selected ? <Icon name="checkmark" size={theme.sizes.icon.sm} color={theme.colors.onChipActive} /> : null}
                <Text variant="label" lang={code} color={selected ? theme.colors.onChipActive : theme.colors.onChipInactive}>
                  {LANGUAGES[code].native}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Muted>{t('profile.languageHint')}</Muted>
      </View>

      <View style={{ gap: theme.space[3] }}>
        <Text variant="h3" accessibilityRole="header">
          {t('profile.data')}
        </Text>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            <View
              style={{
                width: theme.sizes.iconChip,
                height: theme.sizes.iconChip,
                borderRadius: theme.radii.sm,
                backgroundColor: theme.accent.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={sync.kind === 'local' ? 'phone-portrait-outline' : 'cloud-outline'} size={theme.sizes.icon.sm} color={theme.accent.accentIcon} />
            </View>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {syncLabel}
            </Text>
          </View>
          {canSync ? <SecondaryButton label={t('profile.syncNow')} icon="sync-outline" onPress={() => void syncNow()} /> : null}
        </Card>
      </View>
    </Screen>
  );
}
