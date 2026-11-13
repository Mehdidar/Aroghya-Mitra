import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import { Card, Pill, Text, TextField } from '@/features/shared/ui';

import type { DoseSlot, EssentialField, ReviewedMedicine } from './types';

const SLOTS: DoseSlot[] = ['morning', 'afternoon', 'evening', 'night'];

/** One extracted medicine: editable fields; unsure ones carry the "Confirm with pharmacist" pill until edited. */
export function MedicineCard({ med, onChange, onRemove }: { med: ReviewedMedicine; onChange: (m: ReviewedMedicine) => void; onRemove: () => void }) {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const unsure = (f: EssentialField) => med.unsure.includes(f);
  const edit = (f: EssentialField, patch: Partial<ReviewedMedicine>) => onChange({ ...med, ...patch, unsure: med.unsure.filter((x) => x !== f) });
  const hint = (f: EssentialField) => (unsure(f) ? t('prescription.confirmPharmacist') : undefined);

  return (
    <Card radius="xl" padding="lg" testID={`medicine-${med.key}`}>
      <View style={{ gap: theme.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
          <Text variant="title" style={{ flex: 1 }} lang="en">
            {med.name || t('prescription.unnamed')}
          </Text>
          {med.unsure.length ? <Pill label={t('prescription.confirmPharmacist')} tone="warning" icon="alert-circle" /> : <Pill label={t('prescription.looksRight')} tone="success" icon="checkmark-circle" />}
        </View>
        {med.genericName ? (
          <Text variant="caption" tone="tertiary" lang="en">
            {t('prescription.generic', { name: med.genericName })}
          </Text>
        ) : null}
        <TextField label={t('prescription.fields.name')} value={med.name} onChangeText={(v) => edit('name', { name: v })} error={hint('name')} testID={`field-name-${med.key}`} />
        <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
          <View style={{ flex: 1 }}>
            <TextField label={t('prescription.fields.strength')} value={med.strength} onChangeText={(v) => edit('strength', { strength: v })} error={hint('strength')} testID={`field-strength-${med.key}`} />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label={t('prescription.fields.dose')} value={med.dose} onChangeText={(v) => edit('dose', { dose: v })} error={hint('dose')} />
          </View>
        </View>
        <View style={{ gap: theme.space[1] }}>
          <Text variant="label" tone={unsure('timings') ? 'danger' : 'secondary'}>
            {t('prescription.fields.timings')}
            {unsure('timings') ? ` · ${t('prescription.confirmPharmacist')}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
            {SLOTS.map((s) => {
              const on = med.slots.includes(s);
              return (
                <Pressable
                  key={s}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={t(`prescription.slots.${s}`)}
                  onPress={() => edit('timings', { slots: on ? med.slots.filter((x) => x !== s) : [...med.slots, s].sort((a, b) => SLOTS.indexOf(a) - SLOTS.indexOf(b)) })}
                  style={{ minHeight: 44, paddingHorizontal: theme.space[4], borderRadius: theme.radii.full, backgroundColor: on ? theme.accent.accent : theme.colors.surfaceMuted, justifyContent: 'center', borderWidth: 1, borderColor: on ? theme.accent.accent : theme.colors.border }}>
                  <Text variant="label" color={on ? theme.colors.textOnAccent : undefined}>
                    {t(`prescription.slots.${s}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
          <View style={{ flex: 1 }}>
            <TextField
              label={t('prescription.fields.durationDays')}
              value={med.durationDays === null ? '' : String(med.durationDays)}
              numeric
              onChangeText={(v) => edit('durationDays', { durationDays: v.trim() ? Math.max(1, Number(v.replace(/\D/g, '')) || 1) : null })}
              error={hint('durationDays')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label={t('prescription.fields.instructions')} value={med.instructions ?? ''} onChangeText={(v) => onChange({ ...med, instructions: v || null })} />
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={onRemove} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="label" tone="danger">
            {t('prescription.remove')}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}
