import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useCurrentUser } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Heading, Icon, Pill, Screen, StatCard, Text } from '@/features/shared/ui';

/** Doctor/Admin dashboard placeholder (P4 replaces): the big "Scan QR" action plus quick stats. */
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
      <View style={{ flexDirection: 'row', gap: theme.space[3], flexWrap: 'wrap' }}>
        <StatCard label={t('doctor.todayPatients')} value="12" icon="people" />
        <StatCard label={t('doctor.pendingReferrals')} value="3" icon="mail-unread" />
      </View>
      {user?.role === 'admin' ? (
        <Text variant="caption" tone="tertiary">
          {t('doctor.adminNote')}
        </Text>
      ) : null}
    </Screen>
  );
}
