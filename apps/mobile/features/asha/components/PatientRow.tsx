import { router } from 'expo-router';
import React, { memo } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../shared/theme';
import { Icon, Text } from '../../shared/ui';
import { ageDays, ageYears, formatDate, gestationWeeks, isNewborn, isPregnant } from '../logic/clinical';
import type { Lang, Patient, Visit } from '../types';
import { t } from '../data/i18n';
import { Card, RiskBadge, useAshaColors } from './ui';

/** True when the date of birth is missing or unreadable (a patient who signed up on their own phone). */
export const dobUnknown = (p: Patient) => !p.dob || Number.isNaN(Date.parse(p.dob));

export function patientAgeLabel(p: Patient, lang: Lang, at = new Date()): string {
  if (dobUnknown(p)) return t('patient.ageUnknown', lang);
  return isNewborn(p, at) ? t('patient.ageDays', lang, { n: ageDays(p.dob, at) }) : t('patient.age', lang, { n: ageYears(p.dob, at) });
}

/** "F · 25 y · Rampur"; an unrecorded sex is left out (the age part then says what is missing). */
export function patientMetaLine(p: Patient, lang: Lang, at = new Date()): string {
  return [p.sex === 'U' ? null : p.sex, patientAgeLabel(p, lang, at), p.village || null].filter(Boolean).join(' · ');
}

export const PatientRow = memo(function PatientRow({ patient, lastVisit, lang }: { patient: Patient; lastVisit?: Visit; lang: Lang }) {
  const theme = useTheme();
  const colors = useAshaColors();
  const risk = patient.riskLevel ?? 'none';
  const tags = patient.categories.filter((c) => c !== 'general').map((c) => t(`cat.${c}`, lang));
  if (isPregnant(patient)) tags.push(t('patient.ga', lang, { n: gestationWeeks(patient.pregnancy!.lmp) }));
  const age = patientAgeLabel(patient, lang);
  const details = patient.needsDetails ? t('patient.needsDetailsShort', lang) : null;
  const a11y = [patient.name, risk !== 'none' ? t(`risk.${risk}`, lang) : null, age, patient.village, details, ...tags].filter(Boolean).join(', ');
  return (
    // Shared list-row card (radius lg, like the doctor's patient list); the start bar repeats the
    // risk level, which the pill states in words.
    <Card
      radius="lg"
      padding="md"
      onPress={() => router.push(`/asha/patient/${patient.id}`)}
      accessibilityLabel={a11y}
      testID={`patient-row-${patient.id}`}
      style={{ borderStartWidth: 4, borderStartColor: colors.risk[risk].bar, minHeight: theme.sizes.touchMin + 24 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" numberOfLines={2}>
            {patient.name}
          </Text>
          {/* Under the name (not beside it) so a long name and the pill never squeeze each other at large text. */}
          {risk !== 'none' ? <RiskBadge level={risk} label={t(`risk.${risk}`, lang)} style={{ marginVertical: 2 }} /> : null}
          <Text variant="bodySmall" tone="secondary" numberOfLines={2}>
            {patientMetaLine(patient, lang)}
          </Text>
          {details ? (
            <Text variant="caption" weight="semibold" color={theme.colors.status.warning.fg} numberOfLines={2}>
              {details}
            </Text>
          ) : null}
          {tags.length ? (
            <Text variant="caption" weight="semibold" tone="accent" numberOfLines={2}>
              {tags.join(' · ')}
            </Text>
          ) : null}
          {lastVisit?.followUpOn ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }}>
              <Icon name="calendar-outline" size={theme.sizes.icon.xs} color={theme.colors.textTertiary} />
              <Text variant="caption" tone="tertiary" numberOfLines={2} style={{ flexShrink: 1 }}>
                {t('patient.followUp', lang, { date: formatDate(lastVisit.followUpOn) })}
              </Text>
            </View>
          ) : null}
        </View>
        <Icon name="chevron-forward" size={theme.sizes.icon.sm} color={theme.colors.textTertiary} flipInRTL />
      </View>
    </Card>
  );
});
