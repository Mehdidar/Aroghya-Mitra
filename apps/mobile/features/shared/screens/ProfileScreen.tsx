import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { LANGUAGES, LANGUAGE_CODES } from '@/features/shared/i18n/languages';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useCurrentUser, useSession } from '@/features/shared/state/session';
import { textScale as textScaleTokens, useTheme, useThemeSettings } from '@/features/shared/theme';
import { Avatar, Card, Heading, Icon, Pill, PrimaryButton, Screen, SecondaryButton, Text } from '@/features/shared/ui';
import { AudioGuideToggle, ScreenGuide } from '@/features/shared/a11y/audioGuide';

/** Shared profile: who is signed in, the language switcher, sign out. Used by patient and doctor tabs. */
export function ProfileScreen({ note }: { note?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const user = useCurrentUser();
  const signOut = useSession((s) => s.signOut);
  const { language, setLanguage } = useLanguage();
  const a11y = useThemeSettings();

  return (
    <Screen withTabBar testID="screen-profile" contentStyle={{ gap: theme.space[5] }}>
      <Heading variant="h1">{t('profile.title')}</Heading>
      <ScreenGuide id="profile" />
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
      <Card radius="xl" testID="a11y-card">
        <View style={{ gap: theme.space[3] }}>
          <Text variant="label">{t('profile.accessibility')}</Text>
          <View style={{ gap: theme.space[2] }}>
            <Text variant="bodySmall" tone="secondary">
              {t('profile.textSize')}
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.space[2], flexWrap: 'wrap' }} accessibilityRole="radiogroup">
              {textScaleTokens.steps.map((step) => {
                const selected = a11y.textScale === step;
                return (
                  <Pressable
                    key={step}
                    role="radio"
                    aria-checked={selected}
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${t('profile.textSize')} ${Math.round(step * 100)}%`}
                    onPress={() => a11y.setTextScale(step)}
                    testID={`text-scale-${step}`}
                    style={{
                      minHeight: theme.sizes.touchMin,
                      minWidth: theme.sizes.touchMin,
                      paddingHorizontal: theme.space[4],
                      borderRadius: theme.radii.full,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? theme.accent.accent : theme.colors.surfaceMuted,
                      borderWidth: 1,
                      borderColor: selected ? theme.accent.accent : theme.colors.border,
                    }}>
                    <Text weight="semibold" color={selected ? theme.accent.onAccent : theme.colors.textPrimary}>
                      {`A ${Math.round(step * 100)}%`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <SecondaryButton
            label={a11y.highContrast ? t('profile.highContrastOn') : t('profile.highContrastOff')}
            icon={a11y.highContrast ? 'contrast' : 'contrast-outline'}
            onPress={() => a11y.setHighContrast(!a11y.highContrast)}
            testID="high-contrast-toggle"
          />
          <AudioGuideToggle />
          <View style={{ gap: theme.space[2] }}>
            <Text variant="bodySmall" tone="secondary">
              {t('profile.appearance')}
            </Text>
            <View style={{ flexDirection: 'row', gap: theme.space[2], flexWrap: 'wrap' }} accessibilityRole="radiogroup">
              {(['system', 'light', 'dark'] as const).map((mode) => {
                const selected = a11y.appearance === mode;
                return (
                  <Pressable
                    key={mode}
                    role="radio"
                    aria-checked={selected}
                    accessibilityState={{ selected }}
                    accessibilityLabel={t(`profile.appearance_${mode}`)}
                    onPress={() => a11y.setAppearance(mode)}
                    testID={`appearance-${mode}`}
                    style={{
                      minHeight: theme.sizes.touchMin,
                      paddingHorizontal: theme.space[4],
                      borderRadius: theme.radii.full,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: theme.space[1],
                      backgroundColor: selected ? theme.accent.accent : theme.colors.surfaceMuted,
                      borderWidth: 1,
                      borderColor: selected ? theme.accent.accent : theme.colors.border,
                    }}>
                    <Icon name={mode === 'dark' ? 'moon' : mode === 'light' ? 'sunny' : 'phone-portrait-outline'} size={16} color={selected ? theme.accent.onAccent : theme.colors.textSecondary} />
                    <Text weight="semibold" color={selected ? theme.accent.onAccent : theme.colors.textPrimary}>
                      {t(`profile.appearance_${mode}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Card>
      <PrimaryButton label={t('actions.signOut')} icon="log-out-outline" onPress={signOut} testID="sign-out" />
    </Screen>
  );
}
