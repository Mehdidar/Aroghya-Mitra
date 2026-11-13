import { router, Stack } from 'expo-router';
import React, { useMemo } from 'react';
import { FlatList, View } from 'react-native';
import { RiskBadge, Row, useAshaColors } from '../../../features/asha/components/ui';
import { formatDate } from '../../../features/asha/logic/clinical';
import { useAsha } from '../../../features/asha/store/AshaContext';
import type { RiskLevel } from '../../../features/asha/types';
import { useTheme } from '../../../features/shared/theme';
import { Card, EmptyState, Icon, Text } from '../../../features/shared/ui';

const URGENCY_LEVEL: Record<string, RiskLevel> = { emergency: 'critical', urgent: 'high', routine: 'medium' };

export default function ReferralsScreen() {
  const { db, t } = useAsha();
  const theme = useTheme();
  const colors = useAshaColors();
  const referrals = useMemo(() => Object.values(db.referrals).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [db.referrals]);
  const pending = new Set(db.outbox.filter((o) => o.kind === 'referral').map((o) => o.id));

  return (
    <>
      <Stack.Screen options={{ title: t('referrals.title') }} />
      <FlatList
        data={referrals}
        keyExtractor={(r) => r.id}
        testID="screen-asha-referrals"
        style={{ backgroundColor: theme.colors.page }}
        contentContainerStyle={{ paddingHorizontal: theme.layout.screenPaddingX, paddingVertical: theme.space[4], gap: theme.space[3] }}
        renderItem={({ item: r }) => (
          <Card
            onPress={() => router.push(`/asha/patient/${r.patientId}`)}
            style={{ borderStartWidth: 4, borderStartColor: colors.risk[URGENCY_LEVEL[r.urgency]].bar, gap: theme.space[2] }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                {db.patients[r.patientId]?.name ?? r.patientId}
              </Text>
              <RiskBadge level={URGENCY_LEVEL[r.urgency]} label={t(`urgency.${r.urgency}`)} style={{ alignSelf: 'center' }} />
            </Row>
            <Text variant="bodySmall" numberOfLines={3}>
              {r.reason}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }}>
              <Icon name={pending.has(r.id) ? 'cloud-upload-outline' : 'time-outline'} size={theme.sizes.icon.xs} color={theme.colors.textTertiary} />
              <Text variant="caption" tone="tertiary" style={{ flexShrink: 1 }}>
                {formatDate(r.createdAt)} · {t(`refstatus.${r.status}`)}
                {pending.has(r.id) ? ` · ${t('sync.pending')}` : ''}
              </Text>
            </View>
          </Card>
        )}
        ListEmptyComponent={<EmptyState icon="paper-plane-outline" title={t('referrals.empty')} />}
      />
    </>
  );
}
