import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { toDay, type PlanItem } from '@am/patient-ai/prevention/index';

import { Button, Card, Muted, Screen } from '@/features/asha/components/ui';
import { useAsha } from '@/features/asha/store/AshaContext';
import { FlagList, GuidelineList, PlanSections } from '@/features/prevention/components';
import { usePreventionOutbox } from '@/features/prevention/outbox';
import { personFromAsha } from '@/features/prevention/person';
import { RecordPanel } from '@/features/prevention/RecordForms';
import { usePreventionPlan } from '@/features/prevention/usePreventionPlan';
import { feedback } from '@/features/shared/feedback';
import { useTheme } from '@/features/shared/theme';
import { EmptyState, Pill, Text } from '@/features/shared/ui';

/**
 * ASHA: one patient's preventive plan (vaccines, ANC, growth, anaemia, NCD
 * screening) and quick recording. Works offline from the caseload on the phone;
 * writes are queued and sent to POST /prevention/records when online.
 */
export default function AshaPrevention() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const { t } = useTranslation('prevent');
  const theme = useTheme();
  const { db, store } = useAsha();
  const enqueue = usePreventionOutbox((s) => s.enqueue);
  const dismiss = usePreventionOutbox((s) => s.dismiss);
  const patient = patientId ? db.patients[patientId] : undefined;
  // store.visitsFor reads the store's current snapshot: db.visits is the signal that it changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const local = useMemo(() => (patient ? personFromAsha(patient, store.visitsFor(patient.id)) : null), [patient, store, db.visits]);
  const view = usePreventionPlan(patient ? patientId : null, local);
  const plan = view.plan;

  if (!patient) {
    return (
      <Screen>
        <EmptyState icon="person-outline" title={t('state.notFound')} />
      </Screen>
    );
  }

  const vaccines = (plan?.items ?? []).filter((i) => i.category === 'vaccine' && i.status !== 'done' && i.status !== 'missed');
  const givenToday = (item: PlanItem) =>
    item.category === 'vaccine' && (item.status === 'due' || item.status === 'overdue') ? (
      <Button
        title={t('form.givenToday')}
        icon="checkmark-circle-outline"
        variant="secondary"
        onPress={() => {
          enqueue('vaccination', patient.id, { vaccineCode: item.code, dose: item.dose ?? 1, givenOn: toDay(new Date()) });
          feedback.success(t('form.saved'));
        }}
        testID={`given-${item.id}`}
      />
    ) : null;

  return (
    <Screen testID="screen-asha-prevention">
      <Stack.Screen options={{ title: t('ashaTitle') }} />
      <Card>
        <Text variant="h3" accessibilityRole="header">
          {patient.name}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {plan?.gestationWeeks != null ? <Pill label={t('pregnancyWeeks', { n: plan.gestationWeeks })} tone="accent" /> : null}
          {view.demo ? <Pill label={t('state.demoShort')} tone="warning" icon="flask-outline" /> : null}
          {view.pending ? <Pill label={t('state.pending', { n: view.pending })} tone="info" icon="cloud-upload-outline" /> : null}
        </View>
        <Muted>{view.source === 'server' ? t('state.synced') : view.source === 'cache' ? t('state.offline') : t('state.device')}</Muted>
        {view.rejected.map((r) => (
          <View key={r.id} style={{ gap: theme.space[1] }}>
            <Text variant="bodySmall" color={theme.colors.danger}>
              {t('state.rejected', { reason: r.reason })}
            </Text>
            <Button title={t('action.dismiss')} variant="secondary" onPress={() => dismiss(r.id)} />
          </View>
        ))}
        <Button title={t('action.refresh')} icon="refresh" variant="secondary" loading={view.loading} onPress={() => void view.refresh()} />
      </Card>

      <RecordPanel patientId={patient.id} vaccines={vaccines} />

      {!plan || !view.person?.dob ? (
        <Card tone="muted">
          <Muted>{t('state.noData')}</Muted>
        </Card>
      ) : (
        <>
          <FlagList flags={plan.flags} />
          <PlanSections plan={plan} renderAction={givenToday} />
          <GuidelineList plan={plan} />
        </>
      )}
    </Screen>
  );
}
