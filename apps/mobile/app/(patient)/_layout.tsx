import { Stack } from 'expo-router';

/**
 * Patient shell (P1). The (tabs) group holds the four tabs. Any other file in app/(patient)/
 * (P2 and P4 screens such as chat.tsx, qr-card.tsx) is pushed on this stack above the tabs and
 * never becomes a tab, so nobody has to edit the tab layout to add a screen.
 */
export default function PatientLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
