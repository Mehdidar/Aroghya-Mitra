import { router, Stack } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, FlatList, Text } from 'react-native';
import { AlertCard } from '../../../features/asha/components/AlertCard';
import { colors } from '../../../features/asha/components/ui';
import { SEVERITY_RANK, urgencyFor } from '../../../features/asha/logic/rules';
import { useAsha } from '../../../features/asha/store/AshaContext';
import type { RiskAlert } from '../../../features/asha/types';

export default function AlertsScreen() {
  const { db, store, lang, t, user } = useAsha();

  const alerts = useMemo(
    () =>
      store
        .currentAlerts()
        .sort(
          (a, b) =>
            Number(!!a.acknowledged) - Number(!!b.acknowledged) ||
            SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
            (a.createdAt < b.createdAt ? 1 : -1),
        ),
    [db.alerts, db.visits, store],
  );

  const referredAlertIds = useMemo(
    () => new Set(Object.values(db.referrals).filter((r) => r.status !== 'closed').flatMap((r) => r.alertIds)),
    [db.referrals],
  );

  const refer = (a: RiskAlert) => {
    const patientAlerts = alerts.filter((x) => x.patientId === a.patientId);
    const urgency = urgencyFor(patientAlerts);
    Alert.alert(t('visit.referPrompt'), t('visit.referPromptBody', { n: patientAlerts.length, urgency: t(`urgency.${urgency}`) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('visit.referYes'),
        onPress: async () => {
          await store.createReferral({ patientId: a.patientId, fromAshaId: user.id, alertIds: patientAlerts.map((x) => x.id), urgency, visitId: a.visitId });
          await store.acknowledgeAlert(a.id);
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: t('alerts.title') }} />
      <FlatList
        data={alerts}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => (
          <AlertCard
            alert={item}
            lang={lang}
            patientName={db.patients[item.patientId]?.name}
            onOpen={() => router.push(`/asha/patient/${item.patientId}`)}
            onAck={item.acknowledged ? undefined : () => store.acknowledgeAlert(item.id)}
            onRefer={SEVERITY_RANK[item.severity] >= SEVERITY_RANK.high && !referredAlertIds.has(item.id) ? () => refer(item) : undefined}
          />
        )}
        ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: 24 }}>{t('alerts.empty')}</Text>}
      />
    </>
  );
}
