import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { PrescriptionWarning } from '@am/records';

import { useTheme } from '@/features/shared/theme';
import { Card, Icon, Pill, Text } from '@/features/shared/ui';

/**
 * Prescription warnings (copilot feature F). Never blocks silently: every
 * warning is shown, and saving needs the doctor's "I have reviewed this" on each.
 */
export function WarningsPanel({ warnings, acknowledged, onToggle }: { warnings: PrescriptionWarning[]; acknowledged: Set<string>; onToggle: (id: string) => void }) {
  const { t } = useTranslation('copilot');
  const th = useTheme();
  if (!warnings.length) {
    return (
      <View style={{ flexDirection: 'row', gap: th.space[2], alignItems: 'center' }} testID="rx-warnings-none">
        <Icon name="shield-checkmark-outline" size={th.sizes.icon.sm} color={th.colors.status.success.icon} />
        <Text variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
          {t('warn.none')}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ gap: th.space[3] }} testID="rx-warnings" accessibilityLiveRegion="polite">
      <Text variant="label">{t('warn.title', { count: warnings.length })}</Text>
      {warnings.map((w) => {
        const done = acknowledged.has(w.id);
        const danger = w.severity === 'contraindicated' || w.severity === 'major';
        return (
          <Card key={w.id} radius="lg" padding="md" testID={`rx-warning-${w.id}`}>
            <View style={{ gap: th.space[2] }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
                <Pill label={t(`warn.kind.${w.kind}`)} tone={danger ? 'danger' : w.severity === 'info' ? 'neutral' : 'warning'} icon={danger ? 'alert-circle' : 'information-circle-outline'} />
                <Pill label={t(`warn.severity.${w.severity}`)} tone={danger ? 'danger' : 'neutral'} icon="flag-outline" />
              </View>
              <Text variant="bodySmall">{w.message}</Text>
              {w.advice ? (
                <Text variant="bodySmall" tone="secondary">
                  {w.advice}
                </Text>
              ) : null}
              <Text variant="caption" tone="tertiary">
                {t('warn.source', { source: w.source })}
              </Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={t('warn.ack')}
                onPress={() => onToggle(w.id)}
                testID={`rx-warning-ack-${w.id}`}
                style={{ minHeight: th.sizes.touchMin, flexDirection: 'row', alignItems: 'center', gap: th.space[2] }}>
                <Icon name={done ? 'checkbox' : 'square-outline'} size={th.sizes.icon.md} color={done ? th.accent.accent : th.colors.status.neutral.icon} />
                <Text variant="bodySmall" weight="semibold" style={{ flex: 1 }}>
                  {t('warn.ack')}
                </Text>
              </Pressable>
            </View>
          </Card>
        );
      })}
      <Text variant="caption" tone="tertiary">
        {t('warn.review')}
      </Text>
    </View>
  );
}
