import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { CLINICAL_TIMELINE_KINDS, filterTimeline, type ClinicalTimelineEntry, type ClinicalTimelineKind } from '@server/copilot/timeline';

import { useTheme } from '@/features/shared/theme';
import { Card, Icon, type IconName, SecondaryButton, Text } from '@/features/shared/ui';

import { Chip } from './Chip';

const ICON: Record<ClinicalTimelineKind, IconName> = {
  consultation: 'medkit-outline',
  prescription: 'document-text-outline',
  vitals: 'pulse-outline',
  lab: 'flask-outline',
  report: 'folder-open-outline',
  asha_visit: 'walk-outline',
  risk_alert: 'warning-outline',
  referral: 'paper-plane-outline',
};

/** Copilot feature B: every dated event, newest first, with kind filters. */
export function ClinicalTimeline({ entries }: { entries: ClinicalTimelineEntry[] }) {
  const { t } = useTranslation('copilot');
  const th = useTheme();
  const [kinds, setKinds] = useState<ClinicalTimelineKind[]>([]);
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [limit, setLimit] = useState(12);
  const shown = useMemo(() => filterTimeline(entries, kinds, { highRiskOnly }), [entries, kinds, highRiskOnly]);
  const present = CLINICAL_TIMELINE_KINDS.filter((k) => entries.some((e) => e.kind === k));

  return (
    <View style={{ gap: th.space[3] }} testID="copilot-timeline">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
        <Chip label={t('timeline.all')} selected={kinds.length === 0 && !highRiskOnly} onPress={() => (setKinds([]), setHighRiskOnly(false))} testID="timeline-filter-all" />
        {present.map((k) => (
          <Chip key={k} label={t(`timeline.kind.${k}`)} selected={kinds.includes(k)} onPress={() => setKinds((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))} testID={`timeline-filter-${k}`} />
        ))}
        <Chip label={t('timeline.highRisk')} selected={highRiskOnly} onPress={() => setHighRiskOnly((v) => !v)} testID="timeline-filter-high" />
      </View>
      {shown.length === 0 ? (
        <Text tone="secondary">{t('timeline.empty')}</Text>
      ) : (
        shown.slice(0, limit).map((e) => (
          <Card key={e.id} radius="lg" padding="md" testID={`timeline-${e.id}`}>
            <View style={{ flexDirection: 'row', gap: th.space[3] }}>
              <Icon name={ICON[e.kind]} size={th.sizes.icon.sm} color={e.highRisk ? th.colors.status.danger.icon : th.accent.accentIcon} />
              <View style={{ flex: 1, gap: th.space[1] }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2], alignItems: 'center' }}>
                  <Text variant="label" style={{ flexShrink: 1 }}>
                    {t(`timeline.kind.${e.kind}`)}
                  </Text>
                  {e.highRisk ? (
                    <Text variant="caption" tone="danger">
                      {t('timeline.highRiskTag')}
                    </Text>
                  ) : null}
                </View>
                {e.subtitle ? <Text variant="bodySmall">{e.subtitle}</Text> : null}
                <Text variant="caption" tone="tertiary">
                  {[new Date(e.at).toLocaleDateString(), e.actorName].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          </Card>
        ))
      )}
      {shown.length > limit ? <SecondaryButton label={t('timeline.more', { count: shown.length - limit })} onPress={() => setLimit((n) => n + 12)} /> : null}
    </View>
  );
}
