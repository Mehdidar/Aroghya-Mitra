import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { CopilotSummary } from '@server/copilot/summary';
import { labLine } from '@server/copilot/labs';

import { useTheme } from '@/features/shared/theme';
import { Card, Icon, Pill, SecondaryButton, Text } from '@/features/shared/ui';

import type { Narrative } from '../copilot/api';
import type { SummarySource } from '../copilot/useCopilot';

const date = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString();

function Row({ label, children, testID }: { label: string; children: React.ReactNode; testID?: string }) {
  const th = useTheme();
  return (
    <View style={{ gap: th.space[1] }} testID={testID}>
      <Text variant="label">{label}</Text>
      {children}
    </View>
  );
}

function Lines({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <Text tone="secondary" variant="bodySmall">{empty}</Text>;
  return (
    <>
      {items.map((s, i) => (
        <Text key={i} variant="bodySmall">
          {`• ${s}`}
        </Text>
      ))}
    </>
  );
}

/** Copilot feature A: the deterministic summary, with an optional, clearly labelled AI draft. */
export function CopilotSummaryCard({
  summary,
  source,
  narrative,
  narrativeState,
  onRequestNarrative,
}: {
  summary: CopilotSummary;
  source: SummarySource;
  narrative: Narrative | null;
  narrativeState: 'idle' | 'loading' | 'error';
  onRequestNarrative: () => void;
}) {
  const { t } = useTranslation('copilot');
  const th = useTheme();
  const s = summary;
  const latest = s.vitals.recent[0];
  const vitalsText = latest
    ? [
        latest.systolic != null && latest.diastolic != null ? t('summary.bp', { s: latest.systolic, d: latest.diastolic }) : null,
        latest.heartRate != null ? t('summary.hr', { v: latest.heartRate }) : null,
        latest.spo2 != null ? t('summary.spo2', { v: latest.spo2 }) : null,
        latest.weightKg != null ? t('summary.weight', { v: latest.weightKg }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  const bpTrend = [...s.vitals.recent].reverse().filter((v) => v.systolic != null && v.diastolic != null);

  return (
    <Card radius="xl" padding="lg" testID="copilot-summary">
      <View style={{ gap: th.space[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space[2], flexWrap: 'wrap' }}>
          <Icon name="document-text-outline" size={th.sizes.icon.sm} color={th.accent.accentIcon} />
          <Text variant="title" style={{ flex: 1 }}>
            {t('summary.title')}
          </Text>
          <Pill label={source === 'server' ? t('summary.fromServer') : t('summary.fromPhone')} tone="neutral" icon={source === 'server' ? 'cloud-done-outline' : 'phone-portrait-outline'} />
        </View>
        <Text variant="caption" tone="tertiary">
          {t('summary.deterministic')}
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
          {s.allergies.length ? <Pill label={t('summary.allergyPill', { list: s.allergies.join(', ') })} tone="danger" icon="alert-circle" /> : <Pill label={t('summary.noAllergies')} tone="neutral" icon="checkmark-circle-outline" />}
          {s.pregnancy.pregnant ? <Pill label={s.pregnancy.weeks ? t('summary.pregnantWeeks', { n: s.pregnancy.weeks }) : t('summary.pregnant')} tone="info" icon="heart-outline" /> : null}
          {s.asha.openAlerts.length ? <Pill label={t('summary.openAlerts', { count: s.asha.openAlerts.length })} tone="danger" icon="warning" /> : null}
        </View>

        <Row label={t('summary.conditions')}>
          <Lines items={[...s.conditions, ...s.pastDiagnoses.filter((d) => !s.conditions.some((c) => c.toLowerCase() === d.text.toLowerCase())).map((d) => `${d.text} (${date(d.at)})`)]} empty={t('summary.noneRecorded')} />
        </Row>

        <Row label={t('summary.medicines')} testID="copilot-summary-medicines">
          <Lines
            items={s.currentMedicines.map((m) => `${m.name} · ${m.dosage} · ${m.frequency}${m.until ? ` · ${t('summary.until', { date: date(m.until) })}` : ''}${m.source === 'scan' ? ` · ${t('summary.scanned')}` : ''}`)}
            empty={t('summary.noMedicines')}
          />
          {s.adherence.rate !== null ? (
            <Text variant="caption" tone="secondary">
              {t('summary.adherence', { pct: Math.round(s.adherence.rate * 100), days: s.adherence.windowDays, missed: s.adherence.missed })}
            </Text>
          ) : null}
        </Row>

        <Row label={t('summary.vitals')}>
          {latest ? (
            <>
              <Text variant="bodySmall">{`${vitalsText} · ${date(latest.recordedAt)}`}</Text>
              {bpTrend.length > 1 ? (
                <Text variant="caption" tone="secondary">
                  {t('summary.bpTrend', { list: bpTrend.map((v) => `${v.systolic}/${v.diastolic}`).join(' → ') })}
                </Text>
              ) : null}
            </>
          ) : (
            <Text tone="secondary" variant="bodySmall">
              {t('summary.noVitals')}
            </Text>
          )}
        </Row>

        <Row label={t('summary.labs')} testID="copilot-summary-labs">
          {s.labs === null ? (
            <Text tone="secondary" variant="bodySmall">
              {t('summary.labsNeedServer')}
            </Text>
          ) : (
            <Lines items={s.labs.series.map((x) => `${labLine(x)}${x.worsening ? ` · ${t('labs.worsening')}` : ''}`)} empty={t('summary.noLabs')} />
          )}
          {s.reports.length ? (
            <Text variant="caption" tone="secondary">
              {t('summary.reportsOnFile', { list: s.reports.slice(0, 4).map((r) => `${r.title} (${date(r.date)})`).join('; ') })}
            </Text>
          ) : null}
        </Row>

        <Row label={t('summary.consultations')}>
          <Lines
            items={s.consultations.slice(0, 3).map((c) => `${date(c.at)}${c.doctorName ? ` · ${c.doctorName}` : ''}: ${[c.diagnosis, c.notes].filter(Boolean).join('. ') || '—'}${c.labOrders.length ? ` · ${t('summary.labsOrdered', { list: c.labOrders.join(', ') })}` : ''}`)}
            empty={t('summary.noConsultations')}
          />
          {s.nextFollowUp ? (
            <Text variant="caption" tone="secondary">
              {t('summary.followUp', { date: date(s.nextFollowUp) })}
            </Text>
          ) : null}
        </Row>

        <Row label={t('summary.asha')}>
          <Lines
            items={[
              ...s.asha.openAlerts.map((a) => `${t(`summary.alert.${a.level}`)}: ${a.reason} (${date(a.at)})`),
              ...s.asha.visits.slice(0, 3).map((v) => `${date(v.at)}${v.ashaName ? ` · ${v.ashaName}` : ''}: ${v.notes ?? '—'}${v.riskLevel ? ` · ${t(`summary.risk.${v.riskLevel}`)}` : ''}`),
            ]}
            empty={t('summary.noAsha')}
          />
        </Row>

        <Row label={t('summary.referrals')}>
          <Lines items={s.openReferrals.map((r) => `${r.reason} · ${t('summary.waiting', { hours: r.waitingHours })}`)} empty={t('summary.noReferrals')} />
        </Row>

        <View style={{ gap: th.space[2], borderTopWidth: 1, borderTopColor: th.colors.border, paddingTop: th.space[3] }} testID="copilot-narrative">
          {narrative?.text ? (
            <>
              <Pill label={t('summary.aiLabel')} tone="warning" icon="sparkles-outline" />
              <Text variant="bodySmall">{narrative.text}</Text>
              <Text variant="caption" tone="tertiary">
                {t('summary.aiFootnote')}
              </Text>
            </>
          ) : narrative && !narrative.text ? (
            <Text variant="bodySmall" tone="secondary" accessibilityLiveRegion="polite">
              {narrative.reason === 'unverified' ? t('summary.aiRejected') : t('summary.aiUnavailable')}
            </Text>
          ) : null}
          {narrativeState === 'error' ? (
            <Text variant="bodySmall" tone="danger" accessibilityLiveRegion="polite">
              {t('summary.aiNeedsServer')}
            </Text>
          ) : null}
          <SecondaryButton
            label={narrativeState === 'loading' ? t('summary.aiWriting') : narrative?.text ? t('summary.aiAgain') : t('summary.aiWrite')}
            icon="sparkles-outline"
            disabled={narrativeState === 'loading'}
            onPress={onRequestNarrative}
            testID="copilot-narrative-request"
          />
        </View>
      </View>
    </Card>
  );
}
