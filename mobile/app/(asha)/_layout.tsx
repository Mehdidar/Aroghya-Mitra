import { Stack } from 'expo-router';
import React from 'react';
import { colors } from '../../features/asha/components/ui';
import { AshaProvider } from '../../features/asha/store/AshaContext';

/** ASHA (P3) section. When P1's auth lands, pass the signed-in user: <AshaProvider user={user}>. */
export default function AshaLayout() {
  return (
    <AshaProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </AshaProvider>
  );
}
