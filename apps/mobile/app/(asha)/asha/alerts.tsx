import { router, Stack } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCard } from '../../../features/asha/components/AlertCard';
import { SEVERITY_RANK, urgencyFor } from '../../../features/asha/logic/rules';
import { useAsha } from '../../../features/asha/store/AshaContext';
import type { RiskAlert } from '../../../features/asha/types';
import { useTheme } from '../../../features/shared/theme';
import { EmptyState } from '../../../features/shared/ui';

export default function AlertsScreen() {
  const { db, store, lang, t, user } = useAsha();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

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
        testID="screen-asha-alerts"
        style={{ backgroundColor: theme.colors.page }}
        // Same page padding as the shared Screen: clears the home indicator at the bottom.
        contentContainerStyle={{
          paddingHorizontal: theme.layout.screenPaddingX,
          paddingTop: theme.space[4],
          paddingBottom: insets.bottom + theme.space[6],
          gap: theme.space[3],
          width: '100%',
          maxWidth: theme.layout.maxContentWidth,
          alignSelf: 'center',
        }}
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
        ListEmptyComponent={<EmptyState icon="checkmark-done-circle-outline" title={t('alerts.empty')} />}
      />
    </>
  );
}
