import { Stack } from 'expo-router';
import { View } from 'react-native';

import { EmergencyButton } from '@/features/patient/home/EmergencyButton';
import { FabInsetContext } from '@/features/shared/ui';

/**
 * Patient shell (P1). The (tabs) group holds the four tabs. Any other file in app/(patient)/
 * (P2 and P4 screens such as chat.tsx, qr-card.tsx) is pushed on this stack above the tabs and
 * never becomes a tab, so nobody has to edit the tab layout to add a screen.
 */
export default function PatientLayout() {
  return (
    <View style={{ flex: 1 }}>
      {/* Every patient screen leaves room at the bottom for the floating 108 button. */}
      <FabInsetContext.Provider value={72}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </FabInsetContext.Provider>
      {/* 108 on every patient screen, above the tab bar */}
      <EmergencyButton />
    </View>
  );
}
