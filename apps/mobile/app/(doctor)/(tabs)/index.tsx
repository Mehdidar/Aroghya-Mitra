import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { DEMO_IDS } from '@am/shared';

import { useColumns, useDashboard, useInbox } from '@/features/doctor/useDoctorData';
import { useRecords } from '@/features/shared/data/recordsStore';
import { useCurrentUser } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, Heading, Icon, Pill, PrimaryButton, Screen, SecondaryButton, SectionHeader, Skeleton, StatCard, Text } from '@/features/shared/ui';

/** Doctor / Admin dashboard: today's numbers, the big Scan QR action, recent referrals. */
export default function DoctorDashboard() {
  const { t } = useTranslation(['doctor', 'common']);
  const theme = useTheme();
  const user = useCurrentUser();
  const dash = useDashboard();
  const inbox = useInbox();
  const patients = useRecords((s) => s.patients);
  const { twoColumn } = useColumns();
  const demoPatient = patients[DEMO_IDS.patientRecord];

  return (
    <Screen withTabBar background="hero" testID="screen-doctor-dashboard" contentStyle={{ gap: theme.space[5] }}>
      <View style={{ gap: theme.space[2] }}>
        <Pill label={t(`common:roles.${user?.role ?? 'doctor'}`)} tone="accent" icon="medkit" />
        <Heading variant="h1">{t('common:doctor.dashboardTitle', { name: user?.name ?? '' })}</Heading>
        <Text tone="secondary">{t('common:doctor.dashboardSub')}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common:doctor.scanQr')}
        accessibilityHint={t('common:doctor.scanQrHint')}
        testID="scan-qr"
        onPress={() => router.push('/scan')}
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
          {t('common:doctor.scanQr')}
        </Text>
      </Pressable>

      <View style={{ flexDirection: twoColumn ? 'row' : 'column', flexWrap: 'wrap', gap: theme.space[3] }}>
        <StatCard label={t('dashboard.patientsToday')} value={String(dash.stats.patientsToday)} icon="people-outline" style={{ flex: 1, minWidth: 150 }} testID="stat-patients-today" />
        <StatCard label={t('dashboard.openReferrals')} value={String(inbox.items.length || dash.stats.openReferrals)} icon="mail-unread-outline" style={{ flex: 1, minWidth: 150 }} testID="stat-open-referrals" />
        <StatCard label={t('dashboard.highRisk')} value={String(dash.stats.highRiskOpen)} icon="warning-outline" style={{ flex: 1, minWidth: 150 }} testID="stat-high-risk" />
        <StatCard label={t('dashboard.followUps')} value={String(dash.stats.followUpsDue)} icon="calendar-outline" style={{ flex: 1, minWidth: 150 }} />
      </View>

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('dashboard.recentReferrals')} actionLabel={t('dashboard.seeAll')} onAction={() => router.push('/referrals')} />
        {inbox.loading ? (
          <Skeleton height={88} />
        ) : inbox.items.length === 0 ? (
          <EmptyState icon="mail-open-outline" title={t('inbox.emptyTitle')} body={t('inbox.emptyBody')} />
        ) : (
          inbox.items.slice(0, 3).map((item) => (
            <Card key={item.referral.id} radius="lg" padding="md" onPress={() => router.push({ pathname: '/patient/[id]', params: { id: item.referral.patientId, referralId: item.referral.id } })} accessibilityLabel={inbox.patientNames[item.referral.patientId] ?? item.referral.patientId}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
                <Icon name={item.riskLevel === 'high' ? 'warning' : 'mail-outline'} size={theme.sizes.icon.md} color={item.riskLevel === 'high' ? theme.colors.status.danger.icon : theme.accent.accentIcon} />
                <View style={{ flex: 1 }}>
                  <Text variant="title">{inbox.patientNames[item.referral.patientId] ?? t('patient.unknown')}</Text>
                  <Text variant="bodySmall" tone="secondary" numberOfLines={2}>
                    {item.referral.reason}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={theme.sizes.icon.sm} color={theme.colors.textTertiary} flipInRTL />
              </View>
            </Card>
          ))
        )}
      </View>

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('dashboard.quick')} />
        {demoPatient ? (
          <SecondaryButton label={t('dashboard.openDemoPatient', { name: demoPatient.fullName })} icon="person-outline" onPress={() => router.push({ pathname: '/patient/[id]', params: { id: demoPatient.id } })} testID="open-demo-patient" />
        ) : null}
        <PrimaryButton label={t('patients.register')} icon="person-add-outline" onPress={() => router.push('/patient/new')} />
      </View>
      <Text variant="caption" tone="tertiary">
        {t('demoNote')}
      </Text>
    </Screen>
  );
}
