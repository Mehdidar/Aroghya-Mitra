import { router, Stack } from 'expo-router';
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Chip, ChipRow, Field, H, Row, Screen } from '../../../../features/asha/components/ui';
import { dobFromAge, lmpFromWeeks, parseDateInput } from '../../../../features/asha/logic/clinical';
import { useAsha } from '../../../../features/asha/store/AshaContext';
import { newId } from '../../../../features/asha/store/store';
import type { Patient, PatientCategory } from '../../../../features/asha/types';

const CATEGORIES: PatientCategory[] = ['pregnant', 'newborn', 'elderly', 'ncd', 'tb', 'general'];
const CONDITIONS = ['hypertension', 'diabetes', 'tb_on_treatment', 'anaemia'];

const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));

export default function NewPatient() {
  const { store, user, t } = useAsha();
  const [name, setName] = useState('');
  const [sex, setSex] = useState<'F' | 'M'>('F');
  const [ageY, setAgeY] = useState('');
  const [ageD, setAgeD] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [village, setVillage] = useState('');
  const [address, setAddress] = useState('');
  const [cats, setCats] = useState<PatientCategory[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [weeks, setWeeks] = useState('');
  const [lmp, setLmp] = useState('');
  const [gravida, setGravida] = useState('');
  const [birthWeight, setBirthWeight] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const isNewborn = cats.includes('newborn');
  const isPregnant = cats.includes('pregnant');

  const save = async () => {
    const missing: string[] = [];
    const invalid: string[] = [];
    if (!name.trim()) missing.push(t('form.name'));
    if (!village.trim()) missing.push(t('form.village'));

    let dobISO: string | undefined = dob.trim() ? parseDateInput(dob) : undefined;
    if (dob.trim() && !dobISO) invalid.push(t('form.dob'));
    if (!dobISO) {
      const y = num(ageY) ?? 0;
      const d = num(ageD) ?? 0;
      if (!ageY.trim() && !ageD.trim()) missing.push(isNewborn ? t('form.ageDays') : t('form.ageYears'));
      else if (!(y >= 0 && y <= 120 && d >= 0 && d <= 400)) invalid.push(t('form.ageYears'));
      else dobISO = dobFromAge(y, d);
    }

    let pregnancy: Patient['pregnancy'];
    if (isPregnant) {
      const lmpISO = lmp.trim() ? parseDateInput(lmp) : undefined;
      const w = num(weeks);
      if (lmp.trim() && !lmpISO) invalid.push(t('form.lmp'));
      else if (lmpISO) pregnancy = { lmp: lmpISO };
      else if (w != null && w >= 1 && w <= 44) pregnancy = { lmp: lmpFromWeeks(w) };
      else if (w != null) invalid.push(t('form.weeksPregnant'));
      else missing.push(t('form.weeksPregnant'));
      const g = num(gravida);
      if (pregnancy && g != null && g > 0) pregnancy.gravida = g;
    }

    let newborn: Patient['newborn'];
    if (isNewborn && birthWeight.trim()) {
      const bw = num(birthWeight);
      if (bw == null || !(bw >= 0.4 && bw <= 6)) invalid.push(t('form.birthWeight'));
      else newborn = { birthWeightKg: bw };
    }
    if (phone.trim() && !/^\+?\d{10,13}$/.test(phone.replace(/\s/g, ''))) invalid.push(t('form.phone'));

    if (missing.length || invalid.length) {
      Alert.alert(
        '',
        [missing.length ? t('form.required', { fields: missing.join(', ') }) : '', invalid.length ? t('form.invalid', { fields: invalid.join(', ') }) : '']
          .filter(Boolean)
          .join('\n'),
      );
      return;
    }

    setSaving(true);
    const patient: Patient = {
      id: newId('pat'),
      name: name.trim(),
      sex,
      dob: dobISO!,
      phone: phone.replace(/\s/g, '') || undefined,
      village: village.trim(),
      address: address.trim() || undefined,
      categories: cats.length ? cats : ['general'],
      assignedAshaId: user.id,
      pregnancy,
      newborn,
      conditions: conditions.length ? conditions : undefined,
      riskLevel: 'none',
    };
    await store.savePatient(patient);
    router.replace(`/asha/patient/${patient.id}`);
  };

  return (
    <Screen testID="screen-asha-new-patient" footer={<Button title={t('form.save')} icon="checkmark-circle-outline" onPress={save} loading={saving} testID="save-patient" />}>
      <Stack.Screen options={{ title: t('form.newPatient') }} />
      <Card>
        <Field label={t('form.name')} value={name} onChangeText={setName} autoCapitalize="words" />
        <H>{t('form.sex')}</H>
        <ChipRow>
          <Chip label={t('form.female')} selected={sex === 'F'} onPress={() => setSex('F')} />
          <Chip label={t('form.male')} selected={sex === 'M'} onPress={() => setSex('M')} />
        </ChipRow>
        <H>{t('form.categories')}</H>
        <ChipRow>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={t(`cat.${c}`)} selected={cats.includes(c)} onPress={() => setCats(toggle(cats, c))} />
          ))}
        </ChipRow>
        <Row style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {isNewborn ? (
            <Field label={t('form.ageDays')} value={ageD} onChangeText={setAgeD} keyboardType="number-pad" />
          ) : (
            <Field label={t('form.ageYears')} value={ageY} onChangeText={setAgeY} keyboardType="number-pad" />
          )}
          <Field label={t('form.dob')} value={dob} onChangeText={setDob} placeholder="DD/MM/YYYY" />
        </Row>
      </Card>

      {isPregnant ? (
        <Card>
          <H>{t('cat.pregnant')}</H>
          <Row style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label={t('form.weeksPregnant')} value={weeks} onChangeText={setWeeks} keyboardType="number-pad" />
            <Field label={t('form.lmp')} value={lmp} onChangeText={setLmp} placeholder="DD/MM/YYYY" />
          </Row>
          <Field label={t('form.gravida')} value={gravida} onChangeText={setGravida} keyboardType="number-pad" />
        </Card>
      ) : null}

      {isNewborn ? (
        <Card>
          <H>{t('cat.newborn')}</H>
          <Field label={t('form.birthWeight')} value={birthWeight} onChangeText={setBirthWeight} keyboardType="decimal-pad" />
        </Card>
      ) : null}

      <Card>
        <Field label={t('form.village')} value={village} onChangeText={setVillage} />
        <Field label={t('form.address')} value={address} onChangeText={setAddress} />
        <Field label={t('form.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <H>{t('patient.conditions')}</H>
        <ChipRow>
          {CONDITIONS.map((c) => (
            <Chip key={c} label={t(`cond.${c}`)} selected={conditions.includes(c)} onPress={() => setConditions(toggle(conditions, c))} />
          ))}
        </ChipRow>
      </Card>
    </Screen>
  );
}
