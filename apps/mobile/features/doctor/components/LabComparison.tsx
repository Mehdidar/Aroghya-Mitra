import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { LAB_TESTS, type LabComparison as Comparison } from '@server/copilot/labs';

import { useTheme } from '@/features/shared/theme';
import { Card, Pill, PrimaryButton, SecondaryButton, Text, TextField } from '@/features/shared/ui';
import { feedback } from '@/features/shared/feedback';

import { saveLabs, type LabEntryRow } from '../copilot/api';
import { Chip } from './Chip';

const today = () => new Date().toISOString().slice(0, 10);

/** Copilot feature E: lab values over time, change vs previous, out-of-range flags; doctors type new values from a report. */
export function LabComparison({ patientId, comparison, canEdit, onSaved }: { patientId: string; comparison: Comparison | null; canEdit: boolean; onSaved: (c: Comparison) => void }) {
  const { t } = useTranslation('copilot');
  const th = useTheme();
  const [adding, setAdding] = useState(false);
  const [observedAt, setObservedAt] = useState(today());
  const [code, setCode] = useState('hb');
  const [value, setValue] = useState('');
  const [rows, setRows] = useState<LabEntryRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const test = LAB_TESTS.find((x) => x.code === code)!;

  const addRow = () => {
    if (!value.trim()) return;
    setRows((r) => [...r.filter((x) => x.testCode !== code), { testCode: code, value: test.grades ? value : value.replace(',', '.') }]);
    setValue('');
  };
  const save = async () => {
    setErrors([]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observedAt)) return setErrors([t('labs.errorDate')]);
    if (!rows.length) return setErrors([t('labs.errorEmpty')]);
    setSaving(true);
    try {
      const r = await saveLabs(patientId, observedAt, rows);
      onSaved(r.comparison);
      setRows([]);
      setAdding(false);
      feedback.success(t('labs.saved'));
    } catch (e) {
      const body = (e as { body?: { errors?: string[]; reason?: string } }).body;
      setErrors(body?.errors ?? [body?.reason === 'labs_unavailable' ? t('labs.unavailable') : t('labs.needServer')]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: th.space[3] }} testID="copilot-labs">
      {comparison === null ? (
        <Text tone="secondary">{t('labs.needServer')}</Text>
      ) : comparison.series.length === 0 ? (
        <Text tone="secondary">{t('labs.empty')}</Text>
      ) : (
        comparison.series.map((s) => {
          const unit = s.qualitative ? '' : ` ${s.unit}`;
          const flag = s.latest.flag;
          return (
            <Card key={s.testCode} radius="lg" padding="md" testID={`lab-${s.testCode}`}>
              <View style={{ gap: th.space[2] }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: th.space[2] }}>
                  <Text variant="title" style={{ flexShrink: 1 }}>
                    {s.testName}
                  </Text>
                  <Pill label={t(`labs.flag.${flag}`)} tone={flag === 'normal' ? 'success' : flag === 'unknown' ? 'neutral' : 'danger'} icon={flag === 'normal' ? 'checkmark-circle-outline' : flag === 'unknown' ? 'help-circle-outline' : 'alert-circle'} />
                  {s.worsening ? <Pill label={t('labs.worsening')} tone="warning" icon="trending-down-outline" /> : null}
                </View>
                <Text numeric>{s.points.map((p) => p.display).join(' → ') + unit}</Text>
                {s.previous && s.change !== null ? (
                  <Text variant="bodySmall" tone="secondary">
                    {t('labs.change', { change: `${s.change > 0 ? '+' : ''}${s.change}${unit}`, pct: s.changePercent !== null ? ` (${s.changePercent > 0 ? '+' : ''}${s.changePercent}%)` : '' })}
                  </Text>
                ) : (
                  <Text variant="bodySmall" tone="secondary">
                    {t('labs.single')}
                  </Text>
                )}
                <Text variant="caption" tone="tertiary">
                  {[
                    s.points.map((p) => new Date(p.observedAt).toLocaleDateString()).join(' → '),
                    s.latest.referenceLow !== null || s.latest.referenceHigh !== null
                      ? t('labs.range', { low: s.latest.referenceLow ?? '—', high: s.latest.referenceHigh ?? '—' })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </Card>
          );
        })
      )}
      {comparison !== null ? (
        <Text variant="caption" tone="tertiary">
          {t('labs.rangeNote')}
        </Text>
      ) : null}

      {canEdit && !adding ? <SecondaryButton label={t('labs.add')} icon="add-circle-outline" onPress={() => setAdding(true)} testID="labs-add" /> : null}
      {canEdit && adding ? (
        <Card radius="lg" padding="md" testID="labs-form">
          <View style={{ gap: th.space[3] }}>
            <TextField label={t('labs.date')} value={observedAt} onChangeText={setObservedAt} placeholder="YYYY-MM-DD" numeric testID="labs-date" />
            <Text variant="label">{t('labs.test')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
              {LAB_TESTS.map((x) => (
                <Chip key={x.code} label={x.name} selected={code === x.code} onPress={() => (setCode(x.code), setValue(''))} testID={`labs-test-${x.code}`} />
              ))}
            </View>
            {test.grades ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
                {test.grades.map((g) => (
                  <Chip key={g} label={g} selected={value === g} onPress={() => setValue(g)} testID={`labs-grade-${g}`} />
                ))}
              </View>
            ) : (
              <TextField label={t('labs.value', { unit: test.unit })} value={value} onChangeText={setValue} numeric keyboardType="decimal-pad" testID="labs-value" />
            )}
            <SecondaryButton label={t('labs.addRow')} icon="add" onPress={addRow} disabled={!value.trim()} testID="labs-add-row" />
            {rows.map((r) => (
              <Text key={r.testCode} variant="bodySmall">{`• ${LAB_TESTS.find((x) => x.code === r.testCode)?.name ?? r.testCode}: ${r.value}`}</Text>
            ))}
            {errors.map((e, i) => (
              <Text key={i} tone="danger" variant="bodySmall" accessibilityLiveRegion="polite">
                {e}
              </Text>
            ))}
            <PrimaryButton label={t('labs.save')} icon="checkmark" loading={saving} onPress={save} disabled={!rows.length} testID="labs-save" />
            <SecondaryButton label={t('cancel')} onPress={() => (setAdding(false), setRows([]), setErrors([]))} />
          </View>
        </Card>
      ) : null}
    </View>
  );
}
