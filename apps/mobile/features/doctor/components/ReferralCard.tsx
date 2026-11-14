import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { InboxAction, PrioritisedItem } from '@am/records';

import { useTheme } from '@/features/shared/theme';
import { Card, Pill, SecondaryButton, Text } from '@/features/shared/ui';

const ACTION_ICON: Record<InboxAction, 'eye-outline' | 'checkmark-circle-outline' | 'close-circle-outline'> = {
  mark_seen: 'eye-outline',
  accept: 'checkmark-circle-outline',
  close: 'close-circle-outline',
};

/** A referral in the ranked inbox, with WHY it is at this place (rule ids and reasons). */
export function ReferralCard({
  item,
  patientName,
  actions,
  onAction,
  onOpen,
}: {
  item: PrioritisedItem;
  patientName: string;
  actions: InboxAction[];
  onAction: (a: InboxAction) => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation('doctor');
  const { t: tc } = useTranslation('copilot');
  const th = useTheme();
  const { referral } = item;
  const sev = item.severity;
  const why = item.reasons
    .map((r) => {
      switch (r.code) {
        case 'severity':
          return tc('priority.reason.severity', { severity: tc(`priority.severity.${r.params.severity}`), rules: r.ruleIds.length ? ` (${r.ruleIds.join(', ')})` : '' });
        case 'urgency':
          return tc(r.params.source === 'referral' ? 'priority.reason.urgencyGiven' : 'priority.reason.urgencyDerived', { urgency: tc(`priority.urgency.${r.params.urgency}`) });
        case 'pregnancy_hypertension':
          return tc('priority.reason.pregnancyHtn', { bp: r.params.bp ? ` (BP ${r.params.bp})` : '', rules: r.ruleIds.length ? ` [${r.ruleIds.join(', ')}]` : '' });
        case 'unread':
          return tc('priority.reason.unread');
        case 'waiting':
          return tc('priority.reason.waiting', { hours: r.params.hours });
      }
    })
    .filter(Boolean);
  return (
    <Card radius="xl" padding="lg" testID={`referral-${referral.id}`}>
      <View style={{ gap: th.space[3] }}>
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={t('inbox.open', { name: patientName })} style={{ gap: th.space[2] }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2], alignItems: 'center' }}>
            <Pill label={tc('priority.rank', { n: item.rank })} tone="neutral" icon="list-outline" />
            {sev ? <Pill label={tc(`priority.severity.${sev}`)} tone={sev === 'critical' || sev === 'high' ? 'danger' : 'warning'} icon={sev === 'critical' || sev === 'high' ? 'warning' : 'alert-circle'} /> : null}
            {item.urgency !== 'routine' ? <Pill label={tc(`priority.urgency.${item.urgency}`)} tone={item.urgency === 'emergency' ? 'danger' : 'warning'} icon="time-outline" /> : null}
            {item.dangerSign ? <Pill label={tc('priority.dangerSign')} tone="danger" icon="heart-dislike-outline" /> : null}
            {item.unread ? <Pill label={t('inbox.new')} tone="accent" icon="mail-unread-outline" /> : <Pill label={t(`status.${referral.status}`)} tone="neutral" icon="time-outline" />}
          </View>
          <Text variant="title">{patientName}</Text>
          <Text variant="bodySmall" tone="secondary">
            {referral.reason}
          </Text>
          <View style={{ gap: th.space[1] }} testID={`referral-${referral.id}-why`}>
            <Text variant="caption" weight="semibold">
              {tc('priority.why')}
            </Text>
            {why.map((w, i) => (
              <Text key={i} variant="caption" tone="secondary">
                {`• ${w}`}
              </Text>
            ))}
          </View>
          <Text variant="caption" tone="tertiary">
            {t('inbox.referredOn', { date: new Date(referral.createdAt).toLocaleDateString() })}
          </Text>
        </Pressable>
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
