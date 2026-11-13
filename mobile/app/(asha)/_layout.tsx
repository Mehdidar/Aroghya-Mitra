import { Stack } from 'expo-router';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { colors } from '../../features/asha/components/ui';
import { AshaProvider } from '../../features/asha/store/AshaContext';
import { useSession } from '../../features/shared/state/session';

/** P1: minimal sign-out in the ASHA home header (the guard then returns to the auth flow). */
function SignOutButton() {
  const signOut = useSession((s) => s.signOut);
  return (
    <Pressable onPress={signOut} hitSlop={10} accessibilityRole="button" accessibilityLabel="Sign out" style={{ minHeight: 44, justifyContent: 'center', paddingEnd: 8 }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Sign out</Text>
    </Pressable>
  );
}

/** ASHA (P3) section. When P1's auth lands, pass the signed-in user: <AshaProvider user={user}>. */
export default function AshaLayout() {
  return (
    <AshaProvider>
      <Stack
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
          headerLeft: route.name === 'asha/index' ? () => <SignOutButton /> : undefined,
        })}
      />
    </AshaProvider>
  );
}
