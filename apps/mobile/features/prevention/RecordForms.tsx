/**
 * ASHA record forms: vaccine given, growth measurement, screening result.
 * Big touch targets (shared ASHA chips/buttons, >= 48 pt). Every save goes to
 * the prevention outbox, so it works offline and syncs later.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { toDay, type PlanItem, type ScreeningKind } from '@am/patient-ai/prevention/index';

import { Button, Card, Chip, ChipRow, Field, H, Muted, Row } from '@/features/asha/components/ui';
import { feedback } from '@/features/shared/feedback';
import { useTheme } from '@/features/shared/theme';
import { Text } from '@/features/shared/ui';

import { usePreventionOutbox } from './outbox';
import type { RecordKind } from './types';

type Tab = 'vaccine' | 'growth' | 'screening';
const SCREEN_KINDS: ScreeningKind[] = ['bp', 'sugar', 'hb', 'anc', 'ultrasound', 'oral', 'breast', 'cervical'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const numOrNull = (s: string): number | null => {
  const v = s.trim().replace(',', '.');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** Pure: the record to queue, or an error key (prevent:form.error.*). */
export function buildRecord(tab: Tab, f: Record<string, string>, today: string, vaccine?: PlanItem | null): { kind: RecordKind; record: Record<string, unknown> } | { error: string } {
  const date = (f.date ?? '').trim() || today;
  if (!DATE.test(date) || date > today) return { error: 'date' };
  if (tab === 'vaccine') {
    if (!vaccine) return { error: 'pickVaccine' };
    return { kind: 'vaccination', record: { vaccineCode: vaccine.code, dose: vaccine.dose ?? 1, givenOn: date, batch: f.batch?.trim() || null } };
  }
  if (tab === 'growth') {
    const weightKg = numOrNull(f.weight ?? '');
    const heightCm = numOrNull(f.height ?? '');
    const muacCm = numOrNull(f.muac ?? '');
    if ([weightKg, heightCm, muacCm].some((x) => Number.isNaN(x))) return { error: 'number' };
    if (weightKg === null && heightCm === null && muacCm === null) return { error: 'empty' };
    if ((weightKg !== null && (weightKg < 0.3 || weightKg > 250)) || (heightCm !== null && (heightCm < 20 || heightCm > 250)) || (muacCm !== null && (muacCm < 5 || muacCm > 50))) return { error: 'range' };
    return { kind: 'growth', record: { measuredOn: date, weightKg, heightCm, muacCm } };
  }
  const kind = f.kind as ScreeningKind;
  if (!SCREEN_KINDS.includes(kind)) return { error: 'pickTest' };
  let value: Record<string, unknown> = {};
  if (kind === 'bp') {
    const s = numOrNull(f.systolic ?? '');
    const d = numOrNull(f.diastolic ?? '');
    if (s === null || d === null || Number.isNaN(s) || Number.isNaN(d) || s < 50 || s > 300 || d < 30 || d > 200 || d >= s) return { error: 'range' };
    value = { systolic: s, diastolic: d };
  } else if (kind === 'sugar') {
    const m = numOrNull(f.sugar ?? '');
    if (m === null || Number.isNaN(m) || m < 20 || m > 800) return { error: 'range' };
    value = { mgdl: m, fasting: f.fasting === '1' };
  } else if (kind === 'hb') {
    const g = numOrNull(f.hb ?? '');
    if (g === null || Number.isNaN(g) || g < 2 || g > 25) return { error: 'range' };
    value = { gdl: g };
  } else if (kind === 'oral' || kind === 'breast' || kind === 'cervical') {
    if (!['normal', 'abnormal', 'referred'].includes(f.result ?? '')) return { error: 'pickResult' };
    value = { result: f.result };
  }
  return { kind: 'screening', record: { kind, screenedOn: date, value } };
}

export function RecordPanel({ patientId, vaccines, now = new Date() }: { patientId: string; vaccines: PlanItem[]; now?: Date }) {
  const { t } = useTranslation('prevent');
  const theme = useTheme();
  const enqueue = usePreventionOutbox((s) => s.enqueue);
  const today = toDay(now);
  const [tab, setTab] = useState<Tab>('vaccine');
  const [f, setF] = useState<Record<string, string>>({ date: today });
  const [vaccine, setVaccine] = useState<PlanItem | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = () => {
    const r = buildRecord(tab, f, today, vaccine);
    if ('error' in r) {
      const text = t(`form.error.${r.error}`);
      setMsg({ ok: false, text });
      feedback.warn(text);
      return;
    }
    enqueue(r.kind, patientId, r.record);
    const text = t('form.saved');
    setMsg({ ok: true, text });
    feedback.success(text);
    setF({ date: today, kind: f.kind ?? '' });
    setVaccine(null);
  };

  return (
    <Card testID="prevention-record">
      <H>{t('form.title')}</H>
      <ChipRow>
        {(['vaccine', 'growth', 'screening'] as Tab[]).map((x) => (
          <Chip key={x} label={t(`form.tab.${x}`)} selected={tab === x} onPress={() => (setTab(x), setMsg(null))} />
        ))}
      </ChipRow>

      {tab === 'vaccine' ? (
        <View style={{ gap: theme.space[2] }}>
          <Text variant="label" tone="secondary">
            {t('form.vaccine')}
          </Text>
          {vaccines.length ? (
            <ChipRow>
              {vaccines.map((v) => (
                <Chip key={v.id} label={v.label ?? v.code} selected={vaccine?.id === v.id} onPress={() => setVaccine(v)} />
              ))}
            </ChipRow>
          ) : (
            <Muted>{t('form.noVaccines')}</Muted>
          )}
          <Field label={t('form.batch')} value={f.batch ?? ''} onChangeText={set('batch')} autoCapitalize="characters" />
        </View>
      ) : null}

      {tab === 'growth' ? (
        <Row style={{ flexWrap: 'wrap' }}>
          <Field label={t('form.weight')} value={f.weight ?? ''} onChangeText={set('weight')} keyboardType="decimal-pad" testID="field-weight" />
          <Field label={t('form.height')} value={f.height ?? ''} onChangeText={set('height')} keyboardType="decimal-pad" />
          <Field label={t('form.muac')} value={f.muac ?? ''} onChangeText={set('muac')} keyboardType="decimal-pad" />
        </Row>
      ) : null}

      {tab === 'screening' ? (
        <View style={{ gap: theme.space[2] }}>
          <ChipRow>
            {SCREEN_KINDS.map((k) => (
              <Chip key={k} label={t(`screenKind.${k}`)} selected={f.kind === k} onPress={() => set('kind')(k)} />
            ))}
          </ChipRow>
          {f.kind === 'bp' ? (
            <Row style={{ flexWrap: 'wrap' }}>
              <Field label={t('form.systolic')} value={f.systolic ?? ''} onChangeText={set('systolic')} keyboardType="number-pad" />
              <Field label={t('form.diastolic')} value={f.diastolic ?? ''} onChangeText={set('diastolic')} keyboardType="number-pad" />
            </Row>
          ) : null}
          {f.kind === 'sugar' ? (
            <>
              <Field label={t('form.sugar')} value={f.sugar ?? ''} onChangeText={set('sugar')} keyboardType="number-pad" />
              <ChipRow>
                <Chip label={t('form.random')} selected={f.fasting !== '1'} onPress={() => set('fasting')('0')} />
                <Chip label={t('form.fasting')} selected={f.fasting === '1'} onPress={() => set('fasting')('1')} />
              </ChipRow>
            </>
          ) : null}
          {f.kind === 'hb' ? <Field label={t('form.hb')} value={f.hb ?? ''} onChangeText={set('hb')} keyboardType="decimal-pad" /> : null}
          {f.kind === 'oral' || f.kind === 'breast' || f.kind === 'cervical' ? (
            <ChipRow>
              {(['normal', 'abnormal', 'referred'] as const).map((r) => (
                <Chip key={r} label={t(`form.result.${r}`)} selected={f.result === r} onPress={() => set('result')(r)} tone={r === 'normal' ? undefined : 'danger'} />
              ))}
            </ChipRow>
          ) : null}
        </View>
      ) : null}

      <Field label={t('form.date')} value={f.date ?? today} onChangeText={set('date')} keyboardType="numbers-and-punctuation" placeholder="YYYY-MM-DD" />
      <Button title={t('form.save')} icon="save-outline" onPress={save} testID="prevention-save" />
      {msg ? (
        <Text variant="bodySmall" weight="semibold" color={msg.ok ? theme.colors.status.success.icon : theme.colors.danger} accessibilityLiveRegion="polite">
          {msg.text}
        </Text>
      ) : null}
    </Card>
  );
}
