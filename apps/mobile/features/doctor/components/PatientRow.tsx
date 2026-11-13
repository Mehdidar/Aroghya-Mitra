import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Patient } from '@am/shared';

import { useTheme } from '@/features/shared/theme';
import { Avatar, Card, Icon, Pill, Text } from '@/features/shared/ui';

import { ageFrom } from '../prescriptions';

export function PatientRow({ patient, risk, onPress }: { patient: Patient; risk: 'high' | 'medium' | null; onPress: () => void }) {
  const { t } = useTranslation('doctor');
  const th = useTheme();
  const age = ageFrom(patient.dateOfBirth);
  return (
    <Card radius="lg" padding="md" onPress={onPress} accessibilityLabel={patient.fullName} testID={`patient-${patient.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space[3] }}>
        <Avatar name={patient.fullName} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title">{patient.fullName}</Text>
          <Text variant="bodySmall" tone="secondary">
            {[age !== null ? t('patient.age', { age }) : null, patient.sex ? t(`sex.${patient.sex}`) : null, patient.area].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {risk ? <Pill label={t(`risk.${risk}`)} tone={risk === 'high' ? 'danger' : 'warning'} icon="warning" /> : null}
        <Icon name="chevron-forward" size={th.sizes.icon.sm} color={th.colors.textTertiary} flipInRTL />
      </View>
    </Card>
  );
}
