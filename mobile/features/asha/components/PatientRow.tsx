import { router } from 'expo-router';
import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../shared/theme';
import { Icon, Text } from '../../shared/ui';
import { ageDays, ageYears, formatDate, gestationWeeks, isNewborn, isPregnant } from '../logic/clinical';
import type { Lang, Patient, Visit } from '../types';
import { t } from '../data/i18n';
import { RiskBadge, useAshaColors } from './ui';

export function patientAgeLabel(p: Patient, lang: Lang, at = new Date()): string {
  return isNewborn(p, at) ? t('patient.ageDays', lang, { n: ageDays(p.dob, at) }) : t('patient.age', lang, { n: ageYears(p.dob, at) });
}

export const PatientRow = memo(function PatientRow({ patient, lastVisit, lang }: { patient: Patient; lastVisit?: Visit; lang: Lang }) {
  const theme = useTheme();
  const colors = useAshaColors();
  const risk = patient.riskLevel ?? 'none';
  const tags = patient.categories.filter((c) => c !== 'general').map((c) => t(`cat.${c}`, lang));
  if (isPregnant(patient)) tags.push(t('patient.ga', lang, { n: gestationWeeks(patient.pregnancy!.lmp) }));
  return (
    <Pressable
      accessibilityRole="button"
      testID={`patient-row-${patient.id}`}
      onPress={() => router.push(`/asha/patient/${patient.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        minHeight: theme.sizes.touchMin + 24,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderStartWidth: 4,
        borderStartColor: colors.risk[risk].bar,
        boxShadow: theme.shadows.card.boxShadow,
        paddingVertical: theme.space[3],
        paddingStart: theme.space[4],
        paddingEnd: theme.space[3],
        transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {patient.name}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {patient.sex} · {patientAgeLabel(patient, lang)} · {patient.village}
        </Text>
        {tags.length ? (
          <Text variant="caption" weight="semibold" tone="accent" numberOfLines={1}>
            {tags.join(' · ')}
          </Text>
        ) : null}
        {lastVisit?.followUpOn ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }}>
            <Icon name="calendar-outline" size={theme.sizes.icon.xs} color={theme.colors.textTertiary} />
            <Text variant="caption" tone="tertiary" numberOfLines={1}>
              {t('patient.followUp', lang, { date: formatDate(lastVisit.followUpOn) })}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: theme.space[2] }}>
        {risk !== 'none' ? <RiskBadge level={risk} label={t(`risk.${risk}`, lang)} /> : null}
      </View>
      <Icon name="chevron-forward" size={theme.sizes.icon.sm} color={theme.colors.textTertiary} flipInRTL />
    </Pressable>
  );
});
