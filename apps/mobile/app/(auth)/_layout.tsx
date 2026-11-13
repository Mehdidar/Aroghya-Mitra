import { Stack } from 'expo-router';

/** Auth flow (P1): onboarding -> language -> role picker -> (optional) phone OTP. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
