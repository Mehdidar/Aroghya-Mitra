import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import {
  Avatar,
  Icon,
  IconButton,
  PrimaryButton,
  Screen,
  SectionHeader,
  Text,
} from '@/features/shared/ui';

type Appointment = {
  id: string;
  doctorName: string;
  specialty: string;
  visitType: string;
  date: string;
  time: string;
  location: string;
  avatar?: string;
  fee?: string;
};

const UPCOMING_APPOINTMENTS: Appointment[] = [
  {
    id: 'up-1',
    doctorName: 'Dr. Olivia Wilson',
    specialty: 'Dermatologist',
    visitType: 'Follow-up visit',
    date: 'Friday, 15 Jun',
    time: '11:30 AM',
    location: 'HealthCare Clinic',
  },
  {
    id: 'up-2',
    doctorName: 'Dr. Ethan Parker',
    specialty: 'Endocrinologist',
    visitType: 'Initial visit',
    date: 'Monday, 18 Jun',
    time: '10:30 AM',
    location: 'City Medical Center',
  },
];

const PAST_VISITS: Appointment[] = [
  {
    id: 'past-1',
    doctorName: 'Dr. Ethan Parker',
    specialty: 'Endocrinologist',
    visitType: 'Routine follow-up',
    date: '5 Jun',
    time: '02:00 PM',
    location: 'City Medical Center',
    fee: '$20',
  },
  {
    id: 'past-2',
    doctorName: 'Dr. Amelia Foster',
    specialty: 'Pediatrician',
    visitType: 'Check-up',
    date: '3 Jun',
    time: '11:00 AM',
    location: 'Metro Children Hospital',
    fee: '$18',
  },
  {
    id: 'past-3',
    doctorName: 'Dr. Charlotte Bennett',
    specialty: 'Cardiologist',
    visitType: 'ECG Review',
    date: '28 May',
    time: '04:30 PM',
    location: 'Apollo Heart Center',
    fee: '$25',
  },
  {
    id: 'past-4',
    doctorName: 'Dr. Alexander Reed',
    specialty: 'Neurologist',
    visitType: 'Consultation',
    date: '15 May',
    time: '10:00 AM',
    location: 'Neuro Health Institute',
    fee: '$30',
  },
];

const AVAILABLE_DOCTORS = [
  {
    id: 'doc-1',
    name: 'Dr. Sophia Martinez',
    specialty: 'General Practitioner',
    slots: ['10:00', '10:40', '11:20', '11:50', '12:30'],
  },
  {
    id: 'doc-2',
    name: 'Dr. Daniel Harris',
    specialty: 'Cardiologist',
    slots: ['11:00', '11:40', '14:00', '15:20', '16:00'],
  },
  {
    id: 'doc-3',
    name: 'Dr. Olivia Wilson',
    specialty: 'Dermatologist',
    slots: ['09:30', '10:15', '13:00', '14:30'],
  },
];

/**
 * My Appointments screen matching Image 3 (right screen).
 * Shows upcoming appointments with "Start Chat", past visits with fees, and "Make Appointment" flow.
 */
export default function AppointmentsScreen() {
  const theme = useTheme();
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(AVAILABLE_DOCTORS[0]);
  const [selectedSlot, setSelectedSlot] = useState('10:40');

  const handleStartChat = (doctorName: string) => {
    router.push({
      pathname: '/chat',
      params: { doctor: doctorName },
    });
  };

  const handleConfirmBooking = () => {
    setShowBookingModal(false);
    Alert.alert(
      'Appointment Booked!',
      `Your consultation with ${selectedDoctor.name} is confirmed for tomorrow at ${selectedSlot}.`
    );
  };

  return (
    <Screen
      testID="screen-appointments"
      contentStyle={{ gap: theme.space[4] }}
      footer={
        <PrimaryButton
          label="Make Appointment"
          onPress={() => setShowBookingModal(true)}
          style={{ minHeight: 54, borderRadius: 27, backgroundColor: '#0F172A' }}
        />
      }>
      {/* Top Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconButton
            icon="arrow-back"
            accessibilityLabel="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            flipInRTL
          />
          <Text variant="h2" weight="bold" style={{ color: '#0F172A' }}>
            My Appointments
          </Text>
        </View>
        <IconButton
          icon="ellipsis-horizontal"
          accessibilityLabel="Options"
          onPress={() => Alert.alert('Options', 'Manage appointments')}
        />
      </View>

      {/* Upcoming Section Header (Image 3 right) */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="title" weight="bold">
            Upcoming
          </Text>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 12,
              backgroundColor: '#E0F2FE',
            }}>
            <Text variant="caption" weight="bold" style={{ color: '#0284C7' }}>
              2
            </Text>
          </View>
        </View>
        <Pressable onPress={() => {}}>
          <Text variant="caption" weight="semibold" tone="secondary">
            View all
          </Text>
        </Pressable>
      </View>

      {/* Upcoming Appointment Cards (Image 3 right) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 14, paddingHorizontal: 2 }}>
        {UPCOMING_APPOINTMENTS.map((app) => (
          <View
            key={app.id}
            style={{
              width: 300,
              backgroundColor: '#FFFFFF',
              borderRadius: 22,
              padding: 18,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              gap: 14,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.04,
              shadowRadius: 10,
            }}>
            {/* Doctor Info */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={app.doctorName} size="lg" />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" style={{ color: '#0F172A' }}>
                  {app.doctorName}
                </Text>
                <Text variant="caption" tone="secondary">
                  {app.specialty}
                </Text>
              </View>
            </View>

            {/* Visit Tag */}
            <View
              style={{
                alignSelf: 'flex-start',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: '#F1F5F9',
              }}>
              <Text variant="caption" weight="semibold" style={{ color: '#475569' }}>
                {app.visitType}
              </Text>
            </View>

            {/* Date, Time & Location */}
            <View style={{ gap: 8, paddingVertical: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="calendar-outline" size={16} color="#64748B" />
                <Text variant="caption" style={{ color: '#334155' }}>
                  {app.date}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="time-outline" size={16} color="#64748B" />
                <Text variant="caption" style={{ color: '#334155' }}>
                  {app.time}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="location-outline" size={16} color="#64748B" />
                <Text variant="caption" style={{ color: '#334155' }}>
                  {app.location}
                </Text>
              </View>
            </View>

            {/* Start Chat Button */}
            <Pressable
              accessibilityRole="button"
              onPress={() => handleStartChat(app.doctorName)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: '#F8FAFC',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                opacity: pressed ? 0.8 : 1,
              })}>
              <Icon name="chatbubble-ellipses-outline" size={18} color="#0F172A" />
              <Text variant="bodySmall" weight="semibold" style={{ color: '#0F172A' }}>
                Start Chat
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {/* Past Visits Section Header (Image 3 right) */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <Text variant="title" weight="bold">
          Past Visits
        </Text>
        <Pressable onPress={() => {}}>
          <Text variant="caption" weight="semibold" tone="secondary">
            View all
          </Text>
        </Pressable>
      </View>

      {/* Past Visits List */}
      <View style={{ gap: 10 }}>
        {PAST_VISITS.map((visit) => (
          <View
            key={visit.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 14,
              borderRadius: 18,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#F1F5F9',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.03,
              shadowRadius: 6,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={visit.doctorName} size="md" />
              <View style={{ gap: 2 }}>
                <Text variant="bodySmall" weight="semibold" style={{ color: '#0F172A' }}>
                  {visit.doctorName}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {visit.specialty}
                </Text>
              </View>
            </View>

            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text variant="bodySmall" weight="bold" style={{ color: '#0F172A' }}>
                {visit.fee}
              </Text>
              <Text variant="caption" tone="tertiary">
                {visit.date}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Doctor Booking Sheet Modal (Image 3 middle) */}
      <Modal visible={showBookingModal} animationType="slide" transparent>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'flex-end',
          }}>
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              padding: 24,
              maxHeight: '85%',
              gap: 16,
            }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="h3">Choose a doctor</Text>
              <IconButton icon="close" accessibilityLabel="Close" onPress={() => setShowBookingModal(false)} />
            </View>

            <ScrollView contentContainerStyle={{ gap: 16 }}>
              {AVAILABLE_DOCTORS.map((doc) => {
                const isSelected = selectedDoctor.id === doc.id;
                return (
                  <View
                    key={doc.id}
                    style={{
                      borderRadius: 20,
                      padding: 16,
                      backgroundColor: isSelected ? '#F8FAFC' : '#FFFFFF',
                      borderWidth: 1.5,
                      borderColor: isSelected ? '#0F172A' : '#E2E8F0',
                      gap: 12,
                    }}>
                    <Pressable
                      onPress={() => setSelectedDoctor(doc)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Avatar name={doc.name} size="md" />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="bodyStrong" style={{ color: '#0F172A' }}>
                          {doc.name}
                        </Text>
                        <Text variant="caption" tone="secondary">
                          {doc.specialty}
                        </Text>
                      </View>
                      {isSelected && <Icon name="checkmark-circle" size={22} color="#0F172A" />}
                    </Pressable>

                    {/* Time chips (Image 3 middle) */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {doc.slots.map((slot) => {
                        const isSlotSelected = isSelected && selectedSlot === slot;
                        return (
                          <Pressable
                            key={slot}
                            onPress={() => {
                              setSelectedDoctor(doc);
                              setSelectedSlot(slot);
                            }}
                            style={{
                              paddingHorizontal: 14,
                              paddingVertical: 8,
                              borderRadius: 14,
                              backgroundColor: isSlotSelected ? '#0F172A' : '#F1F5F9',
                            }}>
                            <Text
                              variant="caption"
                              weight="semibold"
                              style={{ color: isSlotSelected ? '#FFFFFF' : '#334155' }}>
                              {slot}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                );
              })}
            </ScrollView>

            <PrimaryButton
              label={`Confirm for ${selectedDoctor.name} at ${selectedSlot}`}
              onPress={handleConfirmBooking}
              style={{ backgroundColor: '#0F172A' }}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
