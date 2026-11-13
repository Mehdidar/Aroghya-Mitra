import { router, Stack } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, Pressable, Text } from 'react-native';
import { colors, Muted, RiskBadge, Row } from '../../../features/asha/components/ui';
import { formatDate } from '../../../features/asha/logic/clinical';
import { useAsha } from '../../../features/asha/store/AshaContext';
import type { RiskLevel } from '../../../features/asha/types';

const URGENCY_LEVEL: Record<string, RiskLevel> = { emergency: 'critical', urgent: 'high', routine: 'medium' };

export default function ReferralsScreen() {
  const { db, t } = useAsha();
  const referrals = useMemo(() => Object.values(db.referrals).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [db.referrals]);
  const pending = new Set(db.outbox.filter((o) => o.kind === 'referral').map((o) => o.id));

  return (
    <>
      <Stack.Screen options={{ title: t('referrals.title') }} />
      <FlatList
        data={referrals}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item: r }) => (
          <Pressable
            onPress={() => router.push(`/asha/patient/${r.patientId}`)}
            style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text, flexShrink: 1 }}>{db.patients[r.patientId]?.name ?? r.patientId}</Text>
              <RiskBadge level={URGENCY_LEVEL[r.urgency]} label={t(`urgency.${r.urgency}`)} />
            </Row>
            <Text style={{ color: colors.text }} numberOfLines={3}>
              {r.reason}
            </Text>
            <Muted>
              {formatDate(r.createdAt)} · {t(`refstatus.${r.status}`)}
              {pending.has(r.id) ? ` · ${t('sync.pending')}` : ''}
            </Muted>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: 24 }}>{t('referrals.empty')}</Text>}
      />
    </>
  );
}
