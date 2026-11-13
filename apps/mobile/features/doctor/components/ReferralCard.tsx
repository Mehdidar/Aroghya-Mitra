import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { InboxAction, InboxItem } from '@am/records';

import { useTheme } from '@/features/shared/theme';
import { Card, Pill, SecondaryButton, Text } from '@/features/shared/ui';

const ACTION_ICON: Record<InboxAction, 'eye-outline' | 'checkmark-circle-outline' | 'close-circle-outline'> = {
  mark_seen: 'eye-outline',
  accept: 'checkmark-circle-outline',
  close: 'close-circle-outline',
};

export function ReferralCard({
  item,
  patientName,
  actions,
  onAction,
  onOpen,
}: {
  item: InboxItem;
  patientName: string;
  actions: InboxAction[];
  onAction: (a: InboxAction) => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation('doctor');
  const th = useTheme();
  const { referral } = item;
  return (
    <Card radius="xl" padding="lg" onPress={onOpen} accessibilityLabel={t('inbox.open', { name: patientName })} testID={`referral-${referral.id}`}>
      <View style={{ gap: th.space[3] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2], alignItems: 'center' }}>
          {item.riskLevel === 'high' ? <Pill label={t('risk.high')} tone="danger" icon="warning" /> : item.riskLevel === 'medium' ? <Pill label={t('risk.medium')} tone="warning" icon="alert-circle" /> : null}
          {item.unread ? <Pill label={t('inbox.new')} tone="accent" icon="mail-unread-outline" /> : <Pill label={t(`status.${referral.status}`)} tone="neutral" icon="time-outline" />}
        </View>
        <Text variant="title">{patientName}</Text>
        <Text variant="bodySmall" tone="secondary">
          {referral.reason}
        </Text>
        <Text variant="caption" tone="tertiary">
          {t('inbox.referredOn', { date: new Date(referral.createdAt).toLocaleDateString() })}
        </Text>
        {actions.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
            {actions.map((a) => (
              <SecondaryButton key={a} label={t(`actions.${a}`)} icon={ACTION_ICON[a]} onPress={() => onAction(a)} testID={`referral-${referral.id}-${a}`} />
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
