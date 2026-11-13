import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { filterPatients } from '@am/records';

import { PatientRow } from '@/features/doctor/components/PatientRow';
import { useRecords } from '@/features/shared/data/recordsStore';
import { useTheme } from '@/features/shared/theme';
import { EmptyState, Heading, PrimaryButton, Screen, SearchBar, Text } from '@/features/shared/ui';

/** Registered patients: search by name, phone or id. */
export default function DoctorPatients() {
  const { t } = useTranslation('doctor');
  const theme = useTheme();
  const patients = useRecords((s) => s.patients);
  const riskAlerts = useRecords((s) => s.riskAlerts);
  const [search, setSearch] = useState('');
  const list = useMemo(() => filterPatients(Object.values(patients), { search }), [patients, search]);
  const riskOf = (id: string) => {
    const open = riskAlerts.filter((a) => a.patientId === id && a.resolvedAt === null);
    return open.some((a) => a.level === 'high') ? 'high' : open.length ? 'medium' : null;
  };
  return (
    <Screen withTabBar background="page" testID="screen-doctor-patients" contentStyle={{ gap: theme.space[4] }}>
      <View style={{ gap: theme.space[1] }}>
        <Heading variant="h1">{t('patients.title')}</Heading>
        <Text tone="secondary">{t('patients.count', { count: Object.keys(patients).length })}</Text>
      </View>
      <SearchBar placeholder={t('patients.search')} value={search} onChangeText={setSearch} testID="patients-search" />
      <PrimaryButton label={t('patients.register')} icon="person-add-outline" onPress={() => router.push('/patient/new')} testID="patients-register" />
      {list.length === 0 ? (
        <EmptyState icon="people-outline" title={t('patients.emptyTitle')} body={search ? t('patients.emptySearch') : t('patients.emptyBody')} />
      ) : (
        <View style={{ gap: theme.space[2] }}>
          {list.map((p) => (
            <PatientRow key={p.id} patient={p} risk={riskOf(p.id)} onPress={() => router.push({ pathname: '/patient/[id]', params: { id: p.id } })} />
          ))}
        </View>
      )}
    </Screen>
  );
}
