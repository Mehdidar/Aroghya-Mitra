import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { ROLES, useSession, type Role } from '@/features/shared/state/session';
import { RoleScope, useTheme } from '@/features/shared/theme';
import { Heading, Icon, PrimaryButton, Screen, SecondaryButton, Text, type IconName } from '@/features/shared/ui';

const ROLE_ICON: Record<Role, IconName> = {
  patient: 'heart',
  asha: 'walk',
  doctor: 'medkit',
  admin: 'business',
};

function RoleCard({ role, selected, onPress }: { role: Role; selected: boolean; onPress: () => void }) {
  const { t } = useTranslation(['common', 'auth']);
  const theme = useTheme(); // inside <RoleScope>: this role's accent
  const { accent, colors } = theme;
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      accessibilityState={{ selected }}
      accessibilityLabel={`${t(`roles.${role}`)}. ${t(`auth:role.${role}`)}`}
      testID={`role-${role}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[4],
        minHeight: 88,
        padding: theme.space[4],
        borderRadius: theme.radii.xl,
        backgroundColor: selected ? accent.accentSoft : colors.surface,
        borderWidth: 2,
        borderColor: selected ? accent.accent : colors.border,
        boxShadow: theme.shadows.card.boxShadow,
        transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
      })}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: theme.radii.lg,
          backgroundColor: selected ? accent.accent : accent.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon name={ROLE_ICON[role]} size={theme.sizes.icon.lg} color={selected ? accent.onAccent : accent.accentIcon} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="title">{t(`roles.${role}`)}</Text>
        <Text variant="bodySmall" tone="secondary">
          {t(`auth:role.${role}`)}
        </Text>
      </View>
      <Icon
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={theme.sizes.icon.lg}
        color={selected ? accent.accent : colors.borderStrong}
      />
    </Pressable>
  );
}

/** Role picker: four role cards; then demo sign-in (instant) or phone sign-in. */
export default function RolePicker() {
  const { t } = useTranslation('auth');
  const theme = useTheme();
  const { meta } = useLanguage();
  const signIn = useSession((s) => s.signIn);
  const setOnboarded = useSession((s) => s.setOnboarded);
  const [selected, setSelected] = useState<Role | null>(null);

  return (
    <Screen
      background="hero"
      testID="screen-role"
      footer={
        selected ? (
          <>
            <PrimaryButton label={t('role.continueDemo')} icon="flash" testID="continue-demo" onPress={() => signIn(selected, 'demo')} />
            <SecondaryButton
              label={t('role.signInPhone')}
              icon="call"
              testID="sign-in-phone"
              onPress={() => {
                setOnboarded(true);
                router.push({ pathname: '/phone', params: { role: selected } });
              }}
            />
          </>
        ) : undefined
      }>
      <View style={{ gap: theme.space[5] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="overline" tone="accent">
            {t('common:appName')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common:language.change')}
            onPress={() => router.push('/language')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space[2],
              minHeight: theme.sizes.touchMin,
              paddingHorizontal: theme.space[4],
              borderRadius: theme.radii.full,
              backgroundColor: theme.colors.glassFillStrong,
              borderWidth: 1,
              borderColor: theme.colors.glassBorder,
            }}>
            <Icon name="language" size={theme.sizes.icon.sm} />
            <Text variant="label">{meta.native}</Text>
          </Pressable>
        </View>
        <View style={{ gap: theme.space[2] }}>
          <Heading variant="h1">{t('role.title')}</Heading>
          <Text tone="secondary">{t('role.body')}</Text>
        </View>
        <View style={{ gap: theme.space[3] }} role="radiogroup">
          {ROLES.map((role) => (
            <RoleScope key={role} role={role}>
              <RoleCard role={role} selected={selected === role} onPress={() => setSelected(role)} />
            </RoleScope>
          ))}
        </View>
      </View>
    </Screen>
  );
}
