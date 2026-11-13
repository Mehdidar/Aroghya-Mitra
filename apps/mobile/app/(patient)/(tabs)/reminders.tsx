// Reminders tab: today's dose timeline from the records store, Taken / Skip, streak and 7-day adherence.
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { TimelineItem } from '@am/patient-ai';

import { useReminders } from '@/features/patient/reminders/useReminders';
import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, Heading, Icon, Pill, PrimaryButton, Screen, SectionHeader, StatCard, Text } from '@/features/shared/ui';
import { currentPatientId } from '@/features/shared/state/session';
import { pullPatientRecords, usePullWhileOpen } from '@/features/shared/data/serverSync';
import { feedback } from '@/features/shared/feedback';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';

const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function DoseRow({ item, onLog }: { item: TimelineItem; onLog: (status: 'taken' | 'skipped') => void }) {
  const { t } = useTranslation('reminders');
  const theme = useTheme();
  const tone = item.status === 'taken' ? 'success' : item.status === 'missed' ? 'danger' : item.status === 'due' ? 'warning' : 'neutral';
  const actionable = item.status === 'due' || item.status === 'upcoming' || item.status === 'missed';
  return (
    <Card radius="lg" padding="md" testID={`dose-${item.dose.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <View style={{ flex: 1, gap: theme.space[1] }}>
          <Text variant="title" lang="en">
            {item.dose.medicineName}
          </Text>
          <Text variant="caption" tone="secondary">
            {[fmt(item.dose.at), item.dose.dose].filter(Boolean).join(' · ')}
          </Text>
          <Pill label={t(`status.${item.status}`)} tone={tone} icon={item.status === 'taken' ? 'checkmark-circle' : item.status === 'missed' ? 'alert-circle' : 'time-outline'} />
        </View>
        {actionable ? (
          <View style={{ gap: theme.space[2] }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('taken')}: ${item.dose.medicineName}`} onPress={() => onLog('taken')} testID={`taken-${item.dose.id}`} style={{ minWidth: 88, minHeight: 48, borderRadius: theme.radii.full, backgroundColor: theme.accent.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="label" color={theme.colors.textOnAccent}>
                {t('taken')}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('skip')}: ${item.dose.medicineName}`} onPress={() => onLog('skipped')} style={{ minWidth: 88, minHeight: 48, borderRadius: theme.radii.full, backgroundColor: theme.colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="label">{t('skip')}</Text>
            </Pressable>
          </View>
        ) : (
          <Icon name={item.status === 'taken' ? 'checkmark-circle' : 'close-circle-outline'} size={theme.sizes.icon.lg} color={item.status === 'taken' ? theme.colors.status.success.icon : theme.colors.textTertiary} />
        )}
      </View>
    </Card>
  );
}

export default function PatientReminders() {
  // The doctor's new prescriptions arrive from the server when this tab opens.
  usePullWhileOpen(() => pullPatientRecords(currentPatientId()), 'patient-reminders');
  const { t } = useTranslation('reminders');
  const theme = useTheme();
  const r = useReminders();

  return (
    <Screen withTabBar background="mist" testID="screen-reminders" contentStyle={{ gap: theme.space[4] }}>
      <View>
        <Heading variant="h1">{t('title')}</Heading>
        <Text tone="secondary">{r.meds.length ? t('subtitle', { taken: r.takenToday, total: r.timeline.length }) : t('subtitleEmpty')}</Text>
      </View>
      <ScreenGuide id="reminders" />
      {r.meds.length ? (
        <View style={{ flexDirection: 'row', gap: theme.space[3] }}>
          <StatCard label={t('streak')} value={String(r.streak)} unit={t('days')} icon="flame" style={{ flex: 1 }} testID="stat-streak" />
          <StatCard label={t('adherence')} value={r.rate === null ? '–' : String(Math.round(r.rate * 100))} unit={r.rate === null ? undefined : '%'} caption={t('last7')} icon="checkmark-done" style={{ flex: 1 }} testID="stat-adherence" />
        </View>
      ) : null}
      {r.meds.length === 0 ? (
        <EmptyState icon="alarm-outline" title={t('emptyTitle')} body={t('emptyBody')} action={<PrimaryButton label={t('scanCta')} icon="camera" onPress={() => router.push('/prescription')} />} testID="reminders-empty" />
      ) : r.timeline.length === 0 ? (
        <EmptyState icon="calendar-outline" title={t('noneTodayTitle')} body={t('noneTodayBody')} />
      ) : (
        r.bySlot.map((g) => (
          <View key={g.slot} style={{ gap: theme.space[2] }}>
            <SectionHeader title={t(`slots.${g.slot}`)} />
            {g.items.map((item) => (
              <DoseRow key={item.dose.id} item={item} onLog={(status) => {
                  r.logDose(item.dose.id, status, new Date(), item.dose);
                  if (status === 'taken') feedback.success(t('home.takenAnnounce', { ns: 'patient', name: item.dose.medicineName }));
                  else feedback.tap();
                }} />
            ))}
          </View>
        ))
      )}
      {r.meds.length ? <PrimaryButton label={t('scanCta')} icon="camera" onPress={() => router.push('/prescription')} /> : null}
      <Text variant="caption" tone="tertiary">
        {t('disclaimer')}
      </Text>
    </Screen>
  );
}
