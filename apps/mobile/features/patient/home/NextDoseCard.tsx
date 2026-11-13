/** Today's next medicine with a big "Taken" button, right under the voice card: the most useful thing for someone on daily tablets. */
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useReminders } from '@/features/patient/reminders/useReminders';
import { useTheme } from '@/features/shared/theme';
import { Card, Icon, Text } from '@/features/shared/ui';
import { feedback } from '@/features/shared/feedback';

export function NextDoseCard() {
  const { t, i18n } = useTranslation('patient');
  const theme = useTheme();
  const { timeline, logDose } = useReminders();
  const open = timeline.filter((x) => x.status === 'due' || x.status === 'upcoming');
  const next = open[0];
  const time = (d: Date) => new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' }).format(d);

  if (!next) {
    return (
      <Card radius="xl" onPress={() => router.push('/reminders')} accessibilityLabel={timeline.length ? t('home.dosesDone') : t('home.noDoses')} testID="reminders-card">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
          <Icon name={timeline.length ? 'checkmark-circle' : 'medical-outline'} color={timeline.length ? theme.colors.status.success.icon : theme.colors.textTertiary} />
          <Text tone="secondary" style={{ flex: 1 }}>
            {timeline.length ? t('home.dosesDone') : t('home.noDoses')}
          </Text>
        </View>
      </Card>
    );
  }

  const due = next.status === 'due';
  const markTaken = () => {
    logDose(next.dose.id, 'taken', new Date(), next.dose);
    feedback.success(t('home.takenAnnounce', { name: next.dose.medicineName }));
  };
  return (
    <Card radius="xl" testID="reminders-card">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <View style={{ width: 48, height: 48, borderRadius: theme.radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: due ? theme.colors.status.warning.bg : theme.colors.tile.mint.bg }}>
          <Icon name="medical" color={due ? theme.colors.status.warning.icon : theme.colors.tile.mint.icon} />
        </View>
        <View style={{ flex: 1 }} accessible accessibilityLabel={`${t('home.nextDose')}: ${next.dose.medicineName}${next.dose.dose ? `, ${next.dose.dose}` : ''}, ${due ? t('home.dueNow') : time(next.dose.at)}`}>
          <Text variant="caption" tone="tertiary">
            {due ? t('home.dueNow') : `${t('home.nextDose')} · ${time(next.dose.at)}`}
          </Text>
          <Text variant="bodyStrong" numberOfLines={2}>
            {next.dose.medicineName}
          </Text>
          {next.dose.dose ? (
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {next.dose.dose}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.markTaken', { name: next.dose.medicineName })}
          onPress={markTaken}
          testID="next-dose-taken"
          style={({ pressed }) => ({
            minHeight: theme.sizes.touchMin,
            minWidth: 88,
            paddingHorizontal: theme.space[4],
            borderRadius: theme.radii.full,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: theme.space[1],
            backgroundColor: theme.accent.accent,
            opacity: pressed ? 0.85 : 1,
          })}>
          <Icon name="checkmark" size={18} color={theme.accent.onAccent} />
          <Text weight="semibold" color={theme.accent.onAccent}>
            {t('home.taken')}
          </Text>
        </Pressable>
      </View>
      {open.length > 1 ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/reminders')} style={{ minHeight: 40, justifyContent: 'center' }}>
          <Text variant="caption" weight="semibold" tone="accent">
            {t('home.moreToday', { count: open.length - 1 })}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
