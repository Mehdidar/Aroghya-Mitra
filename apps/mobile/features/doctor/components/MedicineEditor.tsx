import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { findGeneric } from '@am/patient-ai';
import { findMedicine, medicineLabel, searchMedicines, type Medicine } from '@am/records';

import { useTheme } from '@/features/shared/theme';
import { Card, Icon, IconButton, Text, TextField } from '@/features/shared/ui';

import { SLOTS, type MedicineDraft, type Slot } from '../prescriptions';
import { slotsFor } from '../consultationNote';
import { Chip } from './Chip';

const FREQUENCIES = ['Once a day', 'Twice a day', 'Three times a day', 'At night', 'When needed'] as const;

/** One medicine on the prescription (copilot feature F): search the NLEM list, strength, dose, frequency, duration, times, instructions. */
export function MedicineEditor({ index, value, onChange, onRemove }: { index: number; value: MedicineDraft; onChange: (patch: Partial<MedicineDraft>) => void; onRemove?: () => void }) {
  const { t } = useTranslation('copilot');
  const th = useTheme();
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState<Medicine | null>(null);
  const matches = useMemo(() => (focused && !picked ? searchMedicines(value.name, 6) : []), [focused, picked, value.name]);
  const known = picked ?? findMedicine(value.name);
  const generic = value.name.trim() ? findGeneric(value.name) : null;

  const pick = (m: Medicine) => {
    setPicked(m);
    onChange({ name: medicineLabel(m, m.strengths[0], m.forms[0]) });
  };
  const toggleSlot = (s: Slot) => onChange({ timesOfDay: value.timesOfDay.includes(s) ? value.timesOfDay.filter((x) => x !== s) : [...value.timesOfDay, s] });

  return (
    <Card radius="lg" padding="md" testID={`medicine-${index}`}>
      <View style={{ gap: th.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space[2] }}>
          <Icon name="medical-outline" size={th.sizes.icon.sm} color={th.accent.accentIcon} />
          <Text variant="label" style={{ flex: 1 }}>
            {t('rx.medicineN', { n: index + 1 })}
          </Text>
          {onRemove ? <IconButton icon="trash-outline" accessibilityLabel={t('rx.remove')} onPress={onRemove} /> : null}
        </View>
        <TextField
          label={t('rx.search')}
          value={value.name}
          onChangeText={(v) => {
            setPicked(null);
            onChange({ name: v });
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder="Labetalol 100 mg"
          autoCorrect={false}
          testID={`medicine-${index}-name`}
        />
        {matches.length ? (
          <View style={{ gap: th.space[1] }} accessibilityRole="list">
            {matches.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => pick(m)}
                accessibilityRole="button"
                accessibilityLabel={t('rx.choose', { name: m.generic })}
                testID={`medicine-${index}-pick-${m.id}`}
                style={{ minHeight: th.sizes.touchMin, justifyContent: 'center', paddingHorizontal: th.space[3], borderRadius: th.radii.md, backgroundColor: th.colors.status.neutral.bg }}>
                <Text variant="bodySmall" weight="semibold">
                  {m.generic}
                </Text>
                <Text variant="caption" tone="secondary">
                  {`${m.strengths.join(', ')} · ${m.forms.join(', ')}${m.nlem ? ' · NLEM 2022' : ''}`}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {known ? (
          <View style={{ gap: th.space[2] }}>
            <Text variant="caption" tone="tertiary">
              {t('rx.listed', { name: known.generic, source: known.nlem ? 'NLEM 2022' : t('rx.notNlem') })}
            </Text>
            {known.strengths.length > 1 || known.forms.length > 1 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
                {known.strengths.map((s) => (
                  <Chip key={s} label={s} selected={value.name.includes(s)} onPress={() => onChange({ name: medicineLabel(known, s, known.forms[0]) })} testID={`medicine-${index}-strength-${s}`} />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: th.space[2] }}>
          <View style={{ flex: 1 }}>
            <TextField label={t('rx.dose')} value={value.dosage} onChangeText={(v) => onChange({ dosage: v })} placeholder={t('rx.doseHint')} testID={`medicine-${index}-dose`} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label={t('rx.duration')} value={value.durationDays} onChangeText={(v) => onChange({ durationDays: v })} numeric keyboardType="number-pad" testID={`medicine-${index}-duration`} />
          </View>
        </View>
        <TextField label={t('rx.frequency')} value={value.frequency} onChangeText={(v) => onChange({ frequency: v })} placeholder="Twice a day" testID={`medicine-${index}-frequency`} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
          {FREQUENCIES.map((f) => (
            <Chip key={f} label={t(`rx.freq.${f.replace(/\s+/g, '_').toLowerCase()}`)} selected={value.frequency === f} onPress={() => onChange({ frequency: f, timesOfDay: f === 'When needed' ? value.timesOfDay : slotsFor(f) })} />
          ))}
        </View>
        <View style={{ gap: th.space[2] }}>
          <Text variant="label">{t('rx.times')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
            {SLOTS.map((s) => (
              <Chip key={s} label={t(`rx.slot.${s}`)} selected={value.timesOfDay.includes(s)} onPress={() => toggleSlot(s)} testID={`medicine-${index}-slot-${s}`} />
            ))}
          </View>
        </View>
        <TextField label={t('rx.instructions')} value={value.instructions} onChangeText={(v) => onChange({ instructions: v })} placeholder={t('rx.instructionsHint')} testID={`medicine-${index}-instructions`} />
        {generic ? (
          <View style={{ flexDirection: 'row', gap: th.space[2], alignItems: 'flex-start' }} testID={`medicine-${index}-generic`}>
            <Icon name="pricetag-outline" size={th.sizes.icon.xs} color={th.colors.status.success.icon} />
            <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
              {t('rx.generic', { name: generic.generic, pack: generic.pack, ja: generic.janAushadhiInr, brand: generic.brandedInr })}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
