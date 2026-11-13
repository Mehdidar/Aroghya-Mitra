import { useEffect, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import {
  Card,
  Icon,
  IconButton,
  PrimaryButton,
  Screen,
  SectionHeader,
  Text,
} from '@/features/shared/ui';

export default function ServiceScreen() {
  const { id = 'chat' } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation('patient');
  const theme = useTheme();

  // Instant redirect for services that have their own dedicated full-page routes
  if (id === 'chat') {
    return <Redirect href="/chat" />;
  }
  if (id === 'voice') {
    return <Redirect href="/voice" />;
  }
  if (id === 'reports') {
    return <Redirect href="/health" />;
  }
  if (id === 'nutrition') {
    return <Redirect href="/nutrition" />;
  }

  // Render dedicated interactive experiences for the other services
  return (
    <Screen testID={`screen-service-${id}`} contentStyle={{ gap: theme.space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton
          icon="arrow-back"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          flipInRTL
        />
        <Text variant="h2" weight="bold" style={{ color: '#0F172A' }}>
          {t(`services.${id}`, { defaultValue: id.charAt(0).toUpperCase() + id.slice(1) })}
        </Text>
      </View>

      {id === 'prescription' && <PrescriptionView />}
      {id === 'hospitalMap' && <HospitalMapView />}
      {id === 'qrCard' && <QrCardView />}
      {id === 'bloodBanks' && <BloodBanksView />}
    </Screen>
  );
}

function PrescriptionView() {
  const [refilled, setRefilled] = useState<Record<string, boolean>>({});

  const medicines = [
    {
      id: 'm1',
      name: 'Metformin 500 mg',
      dosage: '1 tablet twice daily',
      timing: 'After meals (Morning & Night)',
      doctor: 'Dr. Mim Akhter',
      daysLeft: 12,
    },
    {
      id: 'm2',
      name: 'Amlodipine 5 mg',
      dosage: '1 tablet once daily',
      timing: 'After dinner',
      doctor: 'Dr. Mim Akhter',
      daysLeft: 4,
    },
    {
      id: 'm3',
      name: 'Atorvastatin 10 mg',
      dosage: '1 tablet at bedtime',
      timing: 'Night',
      doctor: 'Dr. Ethan Parker',
      daysLeft: 18,
    },
  ];

  return (
    <ScrollView contentContainerStyle={{ gap: 14 }}>
      <SectionHeader title="Active Prescriptions" />
      {medicines.map((med) => (
        <Card key={med.id} radius="xl" padding="lg">
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ gap: 2 }}>
                <Text variant="title" weight="bold" style={{ color: '#0F172A' }}>
                  {med.name}
                </Text>
                <Text variant="caption" tone="tertiary">
                  Prescribed by {med.doctor}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 10,
                  backgroundColor: med.daysLeft <= 5 ? '#FEE2E2' : '#DCFCE7',
                }}>
                <Text
                  variant="caption"
                  weight="bold"
                  style={{ color: med.daysLeft <= 5 ? '#DC2626' : '#16A34A', fontSize: 11 }}>
                  {med.daysLeft} days left
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="time-outline" size={16} color="#64748B" />
              <Text variant="bodySmall" tone="secondary">
                {med.timing}
              </Text>
            </View>

            <Pressable
              onPress={() => {
                setRefilled((prev) => ({ ...prev, [med.id]: true }));
                Alert.alert('Refill Requested', `Order placed for ${med.name}. Nearest pharmacy notified.`);
              }}
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 14,
                backgroundColor: refilled[med.id] ? '#F1F5F9' : '#0F172A',
                marginTop: 4,
              }}>
              <Icon
                name={refilled[med.id] ? 'checkmark' : 'cart-outline'}
                size={16}
                color={refilled[med.id] ? '#64748B' : '#FFFFFF'}
              />
              <Text
                variant="caption"
                weight="bold"
                style={{ color: refilled[med.id] ? '#64748B' : '#FFFFFF' }}>
                {refilled[med.id] ? 'Refill Ordered' : 'Request Refill'}
              </Text>
            </Pressable>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

function HospitalMapView() {
  const hospitals = [
    {
      id: 'h1',
      name: 'Primary Health Center (PHC) Jayanagar',
      distance: '1.2 km away',
      beds: '14 General beds available',
      phone: '080-26561234',
      type: 'Government PHC',
    },
    {
      id: 'h2',
      name: 'Apollo Speciality Hospital',
      distance: '3.4 km away',
      beds: '28 ICU & General beds',
      phone: '080-46688888',
      type: 'Multi-Specialty',
    },
    {
      id: 'h3',
      name: 'Sagar Emergency Hospital',
      distance: '4.1 km away',
      beds: 'Emergency Trauma 24/7',
      phone: '080-26536789',
      type: 'Emergency Care',
    },
  ];

  return (
    <ScrollView contentContainerStyle={{ gap: 14 }}>
      {/* Emergency Hotline Banner */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 16,
          borderRadius: 20,
          backgroundColor: '#FEE2E2',
          borderWidth: 1,
          borderColor: '#FCA5A5',
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="call" size={24} color="#DC2626" />
          <View>
            <Text variant="bodyStrong" style={{ color: '#991B1B' }}>
              National Ambulance: 108
            </Text>
            <Text variant="caption" style={{ color: '#B91C1C' }}>
              24/7 Emergency response
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => Linking.openURL('tel:108')}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 14,
            backgroundColor: '#DC2626',
          }}>
          <Text variant="caption" weight="bold" style={{ color: '#FFFFFF' }}>
            Call Now
          </Text>
        </Pressable>
      </View>

      <SectionHeader title="Nearby Medical Centers" />
      {hospitals.map((h) => (
        <Card key={h.id} radius="xl" padding="lg">
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyStrong" style={{ color: '#0F172A', flex: 1 }}>
                {h.name}
              </Text>
              <Text variant="caption" tone="secondary">
                {h.distance}
              </Text>
            </View>
            <Text variant="caption" tone="tertiary">
              {h.type} · {h.beds}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => Alert.alert('Directions', `Starting navigation to ${h.name}`)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: '#F1F5F9',
                }}>
                <Icon name="navigate-outline" size={16} color="#0F172A" />
                <Text variant="caption" weight="semibold">
                  Directions
                </Text>
              </Pressable>
              <Pressable
                onPress={() => Linking.openURL(`tel:${h.phone}`)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: '#E0F2FE',
                }}>
                <Icon name="call-outline" size={16} color="#0284C7" />
                <Text variant="caption" weight="semibold" style={{ color: '#0284C7' }}>
                  Call Center
                </Text>
              </Pressable>
            </View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

function QrCardView() {
  return (
    <ScrollView contentContainerStyle={{ gap: 18, alignItems: 'center' }}>
      <Card
        radius="xxl"
        padding="lg"
        style={{
          width: '100%',
          maxWidth: 340,
          backgroundColor: '#0F172A',
          alignItems: 'center',
          gap: 18,
          paddingVertical: 26,
        }}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text variant="title" weight="bold" style={{ color: '#FFFFFF' }}>
            Arogya Health Card
          </Text>
          <Text variant="caption" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
            ABHA ID: 91-8274-1029-4451
          </Text>
        </View>

        {/* QR Code Placeholder Graphic */}
        <View
          style={{
            width: 170,
            height: 170,
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
          }}>
          <Icon name="qr-code" size={140} color="#0F172A" />
        </View>

        {/* Patient Details Summary */}
        <View style={{ width: '100%', gap: 8, paddingHorizontal: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Patient Name:
            </Text>
            <Text variant="caption" weight="bold" style={{ color: '#FFFFFF' }}>
              Lakshmi Gowda
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Blood Group:
            </Text>
            <Text variant="caption" weight="bold" style={{ color: '#F43F5E' }}>
              A+
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Emergency Contact:
            </Text>
            <Text variant="caption" weight="bold" style={{ color: '#FFFFFF' }}>
              +91 98450 12345
            </Text>
          </View>
        </View>
      </Card>

      <PrimaryButton
        label="Share Health QR Card"
        icon="share-outline"
        onPress={() => Alert.alert('Share QR Card', 'QR card ready to share with hospital reception.')}
        style={{ width: '100%', maxWidth: 340, backgroundColor: '#0F172A' }}
      />
    </ScrollView>
  );
}

function BloodBanksView() {
  const bloodGroups = [
    { group: 'A+', units: 28, available: true },
    { group: 'A-', units: 4, available: true },
    { group: 'B+', units: 42, available: true },
    { group: 'B-', units: 2, available: false },
    { group: 'O+', units: 56, available: true },
    { group: 'O-', units: 1, available: false },
    { group: 'AB+', units: 19, available: true },
    { group: 'AB-', units: 3, available: true },
  ];

  return (
    <ScrollView contentContainerStyle={{ gap: 16 }}>
      <SectionHeader title="Blood Group Availability (Bengaluru South)" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {bloodGroups.map((b) => (
          <View
            key={b.group}
            style={{
              width: '22%',
              backgroundColor: b.available ? '#FFE4E6' : '#F1F5F9',
              borderRadius: 16,
              paddingVertical: 14,
              alignItems: 'center',
              gap: 4,
            }}>
            <Text variant="title" weight="bold" style={{ color: b.available ? '#E11D48' : '#94A3B8' }}>
              {b.group}
            </Text>
            <Text variant="caption" tone="secondary" style={{ fontSize: 11 }}>
              {b.units} units
            </Text>
          </View>
        ))}
      </View>

      <Card radius="xl" padding="lg">
        <View style={{ gap: 8 }}>
          <Text variant="bodyStrong">Rotary Bangalore South Blood Bank</Text>
          <Text variant="caption" tone="secondary">
            Rashtrotthana Parishat, Near Ashoka Pillar, Jayanagar
          </Text>
          <Text variant="caption" tone="tertiary">
            Open 24 Hours · Verified Government Partner
          </Text>
          <Pressable
            onPress={() => Linking.openURL('tel:08026563355')}
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: '#E11D48',
              marginTop: 6,
            }}>
            <Icon name="call" size={16} color="#FFFFFF" />
            <Text variant="caption" weight="bold" style={{ color: '#FFFFFF' }}>
              Call Blood Bank
            </Text>
          </Pressable>
        </View>
      </Card>
    </ScrollView>
  );
}
