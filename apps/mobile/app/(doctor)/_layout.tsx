import { Stack } from 'expo-router';

/**
 * Doctor / Admin shell. The (tabs) group holds Dashboard · Patients · Referrals · Admin.
 * Every other screen here (scan, patient/[id], consultation/[patientId], patient/new,
 * doctor-profile) is pushed on this stack above the tabs and never becomes a tab.
 */
export default function DoctorLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
