import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { LanguageCode } from '@/features/shared/i18n/languages';
import type { AppRole } from '@/features/shared/theme';

export type Role = AppRole;
export const ROLES: readonly Role[] = ['patient', 'asha', 'doctor', 'admin'] as const;

/** Demo user shown for each role until Supabase auth lands (Phase B). Names are fictional. */
export const DEMO_USERS: Record<Role, { id: string; name: string; phone: string }> = {
  patient: { id: 'pat-demo-1', name: 'Lakshmi Gowda', phone: '+91 98450 12345' },
  asha: { id: 'asha-demo-1', name: 'Sunita Devi', phone: '+91 99000 23456' },
  doctor: { id: 'doc-demo-1', name: 'Dr. Arjun Rao', phone: '+91 98861 34567' },
  admin: { id: 'adm-demo-1', name: 'Meena Shetty', phone: '+91 97400 45678' },
};

export type SessionState = {
  role: Role | null;
  language: LanguageCode;
  onboarded: boolean;
  /** 'demo' = instant sign-in from the role picker; 'phone' = OTP flow. */
  authMethod: 'demo' | 'phone' | null;
  hasHydrated: boolean;
  signIn: (role: Role, method?: 'demo' | 'phone') => void;
  signOut: () => void;
  setLanguage: (language: LanguageCode) => void;
  setOnboarded: (onboarded: boolean) => void;
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      role: null,
      language: 'en',
      onboarded: false,
      authMethod: null,
      hasHydrated: false,
      signIn: (role, method = 'demo') => set({ role, authMethod: method, onboarded: true }),
      signOut: () => set({ role: null, authMethod: null }),
      setLanguage: (language) => set({ language }),
      setOnboarded: (onboarded) => set({ onboarded }),
    }),
    {
      name: 'aroghya-session-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        role: s.role,
        language: s.language,
        onboarded: s.onboarded,
        authMethod: s.authMethod,
      }),
      onRehydrateStorage: () => () => {
        useSession.setState({ hasHydrated: true });
      },
    }
  )
);

/** The signed-in demo user (null when signed out). */
export function useCurrentUser() {
  const role = useSession((s) => s.role);
  return role ? { role, ...DEMO_USERS[role] } : null;
}
