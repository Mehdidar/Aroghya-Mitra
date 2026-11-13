import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { validatePatientForm, type PatientFormError } from '@am/records';
import { BLOOD_GROUPS, DEMO_FACILITY, type BloodGroup, type Patient } from '@am/shared';

import { useAdmin } from '@/features/doctor/adminStore';
import { newId } from '@/features/doctor/prescriptions';
import { useRecords } from '@/features/shared/data/recordsStore';
import { useTheme } from '@/features/shared/theme';
import { Heading, IconButton, PrimaryButton, Screen, Text, TextField } from '@/features/shared/ui';

function Choice<T extends string>({ options, value, onChange, labelOf, testID }: { options: readonly T[]; value: T | null; onChange: (v: T | null) => void; labelOf: (v: T) => string; testID?: string }) {
  const th = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }} testID={testID}>
      {options.map((o) => {
        const selected = value === o;
        return (
          <Pressable
            key={o}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={labelOf(o)}
            onPress={() => onChange(selected ? null : o)}
            style={{ minHeight: th.sizes.touchMin, minWidth: th.sizes.touchMin, paddingHorizontal: th.space[3], justifyContent: 'center', alignItems: 'center', borderRadius: th.radii.full, borderWidth: 1.5, borderColor: selected ? th.accent.accent : th.colors.border, backgroundColor: selected ? th.accent.accentSoft : th.colors.surface }}>
            <Text variant="bodySmall" weight={selected ? 'semibold' : 'regular'}>
              {labelOf(o)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Register a patient at this facility and assign an ASHA worker. */
export default function RegisterPatient() {
  const { t } = useTranslation('doctor');
  const theme = useTheme();
  const upsertPatient = useRecords((s) => s.upsertPatient);
  const ashas = useAdmin((s) => s.staff).filter((s) => s.role === 'asha' && s.isActive);
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | 'other' | null>(null);
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | null>(null);
  const [area, setArea] = useState('');
  const [conditions, setConditions] = useState('');
  const [ashaId, setAshaId] = useState<string | null>(ashas[0]?.id ?? null);
  const [errors, setErrors] = useState<PatientFormError[]>([]);

  const save = () => {
    const errs = validatePatientForm({ fullName, dateOfBirth: dob || null, phone: phone || null, bloodGroup }, new Date());
    setErrors(errs);
    if (errs.length) return;
    const p: Patient = {
      id: newId('pat'),
      userId: null,
      fullName: fullName.trim(),
      dateOfBirth: dob || null,
      sex,
      phone: phone ? `+91${phone.replace(/\D/g, '').slice(-10)}` : null,
      facilityId: DEMO_FACILITY.id,
      ashaWorkerId: ashaId,
      area: area.trim() || null,
      bloodGroup,
      allergies: [],
      chronicConditions: conditions.split(',').map((s) => s.trim()).filter(Boolean),
      createdAt: new Date().toISOString(),
    };
    upsertPatient(p);
    router.replace({ pathname: '/patient/[id]', params: { id: p.id } });
  };
  const err = (k: PatientFormError) => (errors.includes(k) ? t(`register.errors.${k}`) : undefined);

  return (
    <Screen background="page" testID="screen-register-patient" contentStyle={{ gap: theme.space[4] }} footer={<PrimaryButton label={t('register.save')} icon="checkmark" onPress={save} testID="register-save" />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('back')} flipInRTL onPress={() => (router.canGoBack() ? router.back() : router.replace('/patients'))} />
        <Heading variant="h2">{t('register.title')}</Heading>
      </View>
      <TextField label={t('register.name')} value={fullName} onChangeText={setFullName} error={err('name_required')} testID="register-name" />
      <TextField label={t('register.dob')} value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" numeric error={err('dob_invalid')} />
      <TextField label={t('register.phone')} prefix="+91" value={phone} onChangeText={setPhone} numeric keyboardType="phone-pad" error={err('phone_invalid')} />
      <View style={{ gap: theme.space[2] }}>
        <Text variant="label">{t('register.sex')}</Text>
        <Choice options={['female', 'male', 'other'] as const} value={sex} onChange={setSex} labelOf={(v) => t(`sex.${v}`)} />
      </View>
      <View style={{ gap: theme.space[2] }}>
        <Text variant="label">{t('register.bloodGroup')}</Text>
        <Choice options={BLOOD_GROUPS} value={bloodGroup} onChange={setBloodGroup} labelOf={(v) => v} />
        {err('blood_group_invalid') ? <Text tone="danger">{err('blood_group_invalid')}</Text> : null}
      </View>
      <TextField label={t('register.area')} value={area} onChangeText={setArea} />
      <TextField label={t('register.conditions')} value={conditions} onChangeText={setConditions} hint={t('register.conditionsHint')} />
      <View style={{ gap: theme.space[2] }}>
        <Text variant="label">{t('register.asha')}</Text>
        <Choice options={ashas.map((a) => a.id)} value={ashaId} onChange={setAshaId} labelOf={(id) => ashas.find((a) => a.id === id)?.fullName ?? id} />
      </View>
    </Screen>
  );
}
