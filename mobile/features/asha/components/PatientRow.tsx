import { router } from 'expo-router';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ageDays, ageYears, formatDate, gestationWeeks, isNewborn, isPregnant } from '../logic/clinical';
import type { Lang, Patient, Visit } from '../types';
import { t } from '../data/i18n';
import { colors, RiskBadge } from './ui';

export function patientAgeLabel(p: Patient, lang: Lang, at = new Date()): string {
  return isNewborn(p, at) ? t('patient.ageDays', lang, { n: ageDays(p.dob, at) }) : t('patient.age', lang, { n: ageYears(p.dob, at) });
}

export const PatientRow = memo(function PatientRow({ patient, lastVisit, lang }: { patient: Patient; lastVisit?: Visit; lang: Lang }) {
  const risk = patient.riskLevel ?? 'none';
  const tags = patient.categories.filter((c) => c !== 'general').map((c) => t(`cat.${c}`, lang));
  if (isPregnant(patient)) tags.push(t('patient.ga', lang, { n: gestationWeeks(patient.pregnancy!.lmp) }));
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/asha/patient/${patient.id}`)}
      style={({ pressed }) => [s.row, { borderLeftColor: colors.risk[risk].fg, opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.name} numberOfLines={1}>
          {patient.name}
        </Text>
        <Text style={s.meta} numberOfLines={1}>
          {patient.sex} · {patientAgeLabel(patient, lang)} · {patient.village}
        </Text>
        {tags.length ? <Text style={s.tags} numberOfLines={1}>{tags.join(' · ')}</Text> : null}
        {lastVisit?.followUpOn ? (
          <Text style={s.meta}>{t('patient.followUp', lang, { date: formatDate(lastVisit.followUpOn) })}</Text>
        ) : null}
      </View>
      {risk !== 'none' ? <RiskBadge level={risk} label={t(`risk.${risk}`, lang)} /> : null}
    </Pressable>
  );
});

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
  },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  tags: { fontSize: 13, color: colors.primary, fontWeight: '600' },
});
