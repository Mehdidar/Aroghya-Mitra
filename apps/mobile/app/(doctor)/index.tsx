import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useCurrentUser } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Heading, Icon, Pill, Screen, Text } from '@/features/shared/ui';

/**
 * Doctor/Admin dashboard: the big "Scan QR" action. Patient and referral counts come back once
 * the dashboard is wired to P4's features/doctor/dashboard.ts over real records; hard-coded
 * numbers were removed so the screen never shows invented figures.
 */
export default function DoctorDashboard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const user = useCurrentUser();
  return (
    <Screen withTabBar background="hero" testID="screen-doctor-dashboard" contentStyle={{ gap: theme.space[5] }}>
      <View style={{ gap: theme.space[2] }}>
        <Pill label={t(`roles.${user?.role ?? 'doctor'}`)} tone="accent" icon="medkit" />
        <Heading variant="h1">{t('doctor.dashboardTitle', { name: user?.name ?? 'Dr. Arjun Rao' })}</Heading>
        <Text tone="secondary">{t('doctor.dashboardSub')}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('doctor.scanQr')}
        accessibilityHint={t('doctor.scanQrHint')}
        testID="scan-qr"
        style={({ pressed }) => ({
          minHeight: 136,
          borderRadius: theme.radii.xxl,
          backgroundColor: theme.accent.accent,
          backgroundImage: theme.gradient(theme.accent.immersiveGradient, undefined, '135deg'),
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.space[2],
          boxShadow: theme.shadows.raised.boxShadow,
          transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
        })}>
        <Icon name="qr-code" size={48} color={theme.accent.onAccent} />
        <Text variant="h2" color={theme.accent.onAccent}>
          {t('doctor.scanQr')}
        </Text>
      </Pressable>
      {user?.role === 'admin' ? (
        <Text variant="caption" tone="tertiary">
          {t('doctor.adminNote')}
        </Text>
      ) : null}
    </Screen>
  );
}
