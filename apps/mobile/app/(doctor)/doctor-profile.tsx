import { ProfileScreen } from '@/features/shared/screens/ProfileScreen';

// Named doctor-profile (not profile) so its URL never collides with the patient /profile tab.
export default function DoctorProfile() {
  return <ProfileScreen />;
}
