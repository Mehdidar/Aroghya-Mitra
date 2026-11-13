import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { LANGUAGES, LANGUAGE_CODES } from '@/features/shared/i18n/languages';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useCurrentUser, useSession } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Avatar, Card, Heading, Icon, Pill, PrimaryButton, Screen, Text } from '@/features/shared/ui';

/** Shared profile: who is signed in, the language switcher, sign out. Used by patient and doctor tabs. */
export function ProfileScreen({ note }: { note?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const user = useCurrentUser();
  const signOut = useSession((s) => s.signOut);
  const { language, setLanguage } = useLanguage();

  return (
    <Screen withTabBar testID="screen-profile" contentStyle={{ gap: theme.space[5] }}>
      <Heading variant="h1">{t('profile.title')}</Heading>
      {user ? (
        <Card radius="xl">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
            <Avatar name={user.name} size="lg" />
            <View style={{ flex: 1, gap: theme.space[1] }}>
              <Text variant="title" lang="en">
                {user.name}
              </Text>
              <Text variant="bodySmall" tone="secondary" numeric>
                {user.phone}
              </Text>
              <Pill label={`${t(`roles.${user.role}`)} · ${t('demo.badge')}`} tone="accent" icon="flash" />
            </View>
          </View>
          {note ? (
            <Text variant="caption" tone="tertiary">
              {note}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <View style={{ gap: theme.space[3] }}>
        <Text variant="h3" accessibilityRole="header">
          {t('profile.language')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }} role="radiogroup">
          {LANGUAGE_CODES.map((code) => {
            const selected = code === language;
            return (
              <Pressable
                key={code}
                role="radio"
                aria-checked={selected}
                accessibilityState={{ selected }}
                accessibilityLabel={`${LANGUAGES[code].native}, ${LANGUAGES[code].english}`}
                testID={`profile-lang-${code}`}
                onPress={() => void setLanguage(code)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space[2],
                  minHeight: theme.sizes.touchMin,
                  paddingHorizontal: theme.space[4],
                  borderRadius: theme.radii.full,
                  backgroundColor: selected ? theme.colors.chipActive : theme.colors.surface,
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.chipActive : theme.colors.border,
                }}>
                {selected ? <Icon name="checkmark" size={theme.sizes.icon.sm} color={theme.colors.onChipActive} /> : null}
                <Text variant="label" lang={code} color={selected ? theme.colors.onChipActive : theme.colors.onChipInactive}>
                  {LANGUAGES[code].native}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text variant="caption" tone="tertiary">
        {t('demo.note')}
      </Text>
      <PrimaryButton label={t('actions.signOut')} icon="log-out-outline" onPress={signOut} testID="sign-out" />
    </Screen>
  );
}
