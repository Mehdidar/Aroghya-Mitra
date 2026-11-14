/** Shared preventive-care UI for the patient and ASHA screens. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { DANGER_SIGNS, GUIDELINES, type PlanFlag, type PlanItem, type PreventionPlan } from '@am/patient-ai/prevention/index';

import { feedback } from '@/features/shared/feedback';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';
import { Card, Icon, Pill, SecondaryButton, SectionHeader, Text } from '@/features/shared/ui';

import { STATUS_ORDER, STATUS_TONE, flagText, formatDay, itemReason, itemTitle, itemWhen } from './format';
import { remindAbout } from './reminders';

export function PlanItemCard({ item, onRemind, action }: { item: PlanItem; onRemind?: boolean; action?: React.ReactNode }) {
  const { t } = useTranslation('prevent');
  const theme = useTheme();
  const { meta } = useLanguage();
  const [note, setNote] = useState<string | null>(null);
  const g = GUIDELINES.find((x) => x.id === item.guideline.id);
  const title = itemTitle(t, item);
  const when = itemWhen(t, item, meta.bcp47);

  const remind = async () => {
    feedback.tap();
    const r = await remindAbout(item, { title: t('remind.title', { item: title }), body: itemReason(t, item, meta.bcp47), channelName: t('reminders:notifChannel'), taken: t('reminders:taken'), skip: t('reminders:skip') });
    const msg = r.state === 'scheduled' ? t('remind.set', { date: formatDay(r.at.toISOString().slice(0, 10), meta.bcp47) }) : r.state === 'unsupported' ? t('remind.unsupported') : t('remind.denied');
    setNote(msg);
    if (r.state === 'scheduled') feedback.success(msg);
    else feedback.warn(msg);
  };

  return (
    <Card radius="xl" padding="lg" testID={`plan-item-${item.id}`}>
      <View style={{ gap: theme.space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space[2], flexWrap: 'wrap' }}>
          <Text variant="bodyStrong" style={{ flex: 1, minWidth: 160 }}>
            {title}
          </Text>
          <Pill label={t(`status.${item.status}`)} tone={STATUS_TONE[item.status]} />
        </View>
        {when ? (
          <Text variant="bodySmall" weight="semibold" tone="secondary">
            {when}
          </Text>
        ) : null}
        <Text variant="bodySmall">{itemReason(t, item, meta.bcp47)}</Text>
        <Text variant="caption" tone="tertiary">
          {t('guideline.source', { title: g?.title ?? item.guideline.id, version: item.guideline.version })}
          {item.guideline.status === 'needs_clinical_review' ? ` · ${t('guideline.needsReview')}` : ''}
          {item.guideline.uncertain ? ` · ${t('guideline.uncertain')}` : ''}
        </Text>
        {onRemind && (item.status === 'due' || item.status === 'overdue' || item.status === 'upcoming') ? (
          <SecondaryButton label={t('remind.button')} icon="alarm-outline" onPress={() => void remind()} testID={`remind-${item.id}`} accessibilityHint={t('remind.hint', { item: title })} />
        ) : null}
        {note ? (
          <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
            {note}
          </Text>
        ) : null}
        {action}
      </View>
    </Card>
  );
}

export function FlagList({ flags }: { flags: PlanFlag[] }) {
  const { t } = useTranslation('prevent');
  const theme = useTheme();
  const { meta } = useLanguage();
  if (!flags.length) return null;
  return (
    <View style={{ gap: theme.space[3] }} testID="prevention-flags">
      <SectionHeader title={t('section.flags')} />
      {flags.map((f, i) => {
        const s = f.level === 'urgent' ? theme.colors.status.danger : f.level === 'warning' ? theme.colors.status.warning : theme.colors.status.info;
        return (
          <Card key={`${f.code}-${i}`} tone="muted" radius="xl" padding="md" testID={`flag-${f.code}`}>
            <View style={{ flexDirection: 'row', gap: theme.space[2], alignItems: 'flex-start' }}>
              <Icon name={f.level === 'urgent' ? 'alert-circle' : f.level === 'warning' ? 'warning-outline' : 'information-circle-outline'} size={theme.sizes.icon.sm} color={s.icon} />
              <View style={{ flex: 1, gap: theme.space[1] }}>
                <Text variant="bodySmall" weight="semibold">
                  {flagText(t, f, meta.bcp47)}
                </Text>
                {f.code === 'dangerSigns'
                  ? DANGER_SIGNS.map((d) => (
                      <Text key={d} variant="bodySmall">
                        {`• ${t(`danger.${d}`)}`}
                      </Text>
                    ))
                  : null}
                {f.guideline.uncertain ? (
                  <Text variant="caption" tone="tertiary">
                    {t('guideline.uncertain')}
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>
        );
      })}
    </View>
  );
}

/** Items grouped by status, overdue first. `renderAction` adds e.g. the ASHA's "Given today". */
export function PlanSections({ plan, remind, renderAction }: { plan: PreventionPlan; remind?: boolean; renderAction?: (item: PlanItem) => React.ReactNode }) {
  const { t } = useTranslation('prevent');
  const theme = useTheme();
  const groups = STATUS_ORDER.map((s) => ({ status: s, items: plan.items.filter((i) => i.status === s) })).filter((g) => g.items.length);
  if (!groups.length) {
    return (
      <Card tone="muted" radius="xl" padding="md">
        <Text variant="bodySmall" tone="secondary">
          {t('state.empty')}
        </Text>
      </Card>
    );
  }
  return (
    <View style={{ gap: theme.space[4] }}>
      {groups.map((g) => (
        <View key={g.status} style={{ gap: theme.space[3] }} testID={`section-${g.status}`}>
          <SectionHeader title={`${t(`section.${g.status}`)} (${g.items.length})`} />
          {g.items.map((i) => (
            <PlanItemCard key={i.id} item={i} onRemind={remind} action={renderAction?.(i)} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Which guidelines (and versions) the plan used, with review status. */
export function GuidelineList({ plan }: { plan: PreventionPlan }) {
  const { t } = useTranslation('prevent');
  const theme = useTheme();
  const { meta } = useLanguage();
  return (
    <View style={{ gap: theme.space[2] }} testID="prevention-guidelines">
      <SectionHeader title={t('section.guidelines')} />
      <Card tone="muted" radius="xl" padding="md">
        <View style={{ gap: theme.space[2] }}>
          {plan.guidelines.map((g) => (
            <Text key={g.id} variant="caption" tone="secondary">
              {`${g.title} · ${g.issuer} · ${g.version} · ${t('guideline.reviewDue', { date: formatDay(g.reviewDue, meta.bcp47) })}${g.reviewedBy ? '' : ` · ${t('guideline.needsReview')}`}`}
            </Text>
          ))}
          <Text variant="caption" tone="tertiary">
            {t('guideline.disclaimer')}
          </Text>
        </View>
      </Card>
    </View>
  );
}
