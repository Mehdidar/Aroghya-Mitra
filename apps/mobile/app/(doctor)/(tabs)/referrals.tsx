import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { applyAction, availableActions } from '@am/records';

import { ReferralCard } from '@/features/doctor/components/ReferralCard';
import { useInbox } from '@/features/doctor/useDoctorData';
import { useRecords } from '@/features/shared/data/recordsStore';
import { useTheme } from '@/features/shared/theme';
import { EmptyState, Heading, Screen, SecondaryButton, Skeleton, Text } from '@/features/shared/ui';
import { feedback } from '@/features/shared/feedback';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';

/** Referral inbox: ASHA referrals (records store + the ASHA module on this device), ranked by the copilot (risk rules, urgency, pregnancy danger signs, waiting time). */
export default function DoctorReferrals() {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('copilot');
  const theme = useTheme();
  const { items, loading, patientNames, reload } = useInbox();
  const referrals = useRecords((s) => s.referrals);
  const updateReferral = useRecords((s) => s.updateReferral);
  const addReferral = useRecords((s) => s.addReferral);

  return (
    <Screen withTabBar background="page" testID="screen-doctor-inbox" contentStyle={{ gap: theme.space[4] }}>
      <View style={{ gap: theme.space[1] }}>
        <Heading variant="h1">{t('inbox.title')}</Heading>
        <Text tone="secondary">{t('inbox.subtitle', { count: items.length })}</Text>
      </View>
      <ScreenGuide id="doctorInbox" />
      <Text variant="caption" tone="tertiary" testID="inbox-ranking-note">
        {tc('priority.explain')}
      </Text>
      <SecondaryButton label={t('inbox.refresh')} icon="refresh" onPress={reload} />
      {loading ? (
        <View style={{ gap: theme.space[3] }}>
          <Skeleton height={140} />
          <Skeleton height={140} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState icon="mail-open-outline" title={t('inbox.emptyTitle')} body={t('inbox.emptyBody')} testID="inbox-empty" />
      ) : (
        <View style={{ gap: theme.space[3] }}>
          {items.map((item) => (
            <ReferralCard
              key={item.referral.id}
              item={item}
              patientName={patientNames[item.referral.patientId] ?? t('patient.unknown')}
              actions={availableActions(item.referral)}
              onAction={(a) => {
                const patch = applyAction(item.referral, a, new Date());
                feedback.success();
                if (!patch) return;
                // A referral that only exists in the ASHA store is copied into the records store on first action.
                if (!referrals.some((r) => r.id === item.referral.id)) addReferral({ ...item.referral, ...patch });
                else updateReferral(item.referral.id, patch);
              }}
              onOpen={() => router.push({ pathname: '/patient/[id]', params: { id: item.referral.patientId, referralId: item.referral.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
