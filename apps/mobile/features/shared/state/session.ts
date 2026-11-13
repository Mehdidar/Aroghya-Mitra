import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEMO_IDS, DEMO_USERS } from '@am/shared';

import type { LanguageCode } from '@/features/shared/i18n/languages';
import type { AppRole } from '@/features/shared/theme';

export type Role = AppRole;
export const ROLES: readonly Role[] = ['patient', 'asha', 'doctor', 'admin'] as const;

/** The demo cast (shared with the ASHA seed, the records seed and the doctor's inbox). Names are fictional. */
export { DEMO_USERS } from '@am/shared';

export type SessionState = {
  role: Role | null;
  language: LanguageCode;
  onboarded: boolean;
  /** 'demo' = instant sign-in from the role picker; 'phone' = OTP flow. */
  authMethod: 'demo' | 'phone' | null;
  hasHydrated: boolean;
  /** Real sign-in only: the Supabase user, their patient record and name. Null in demo sign-in. */
  userId: string | null;
  patientId: string | null;
  fullName: string | null;
  signIn: (role: Role, method?: 'demo' | 'phone', identity?: { userId: string; patientId?: string | null; fullName?: string | null }) => void;
  signOut: () => void;
  setLanguage: (language: LanguageCode) => void;
  setOnboarded: (onboarded: boolean) => void;
  /** The signed-in user's id (demo cast id until Supabase auth lands). */
  currentUserId: () => string | undefined;
};

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      role: null,
      language: 'en',
      onboarded: false,
      authMethod: null,
      hasHydrated: false,
      userId: null,
      patientId: null,
      fullName: null,
      signIn: (role, method = 'demo', identity) =>
        set({ role, authMethod: method, onboarded: true, userId: identity?.userId ?? null, patientId: identity?.patientId ?? null, fullName: identity?.fullName ?? null }),
      signOut: () => set({ role: null, authMethod: null, userId: null, patientId: null, fullName: null }),
      setLanguage: (language) => set({ language }),
      setOnboarded: (onboarded) => set({ onboarded }),
      currentUserId: () => {
        const r = get().role;
        return r ? (get().userId ?? DEMO_USERS[r].id) : undefined;
      },
    }),
    {
      name: 'aroghya-session-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        role: s.role,
        language: s.language,
        onboarded: s.onboarded,
        authMethod: s.authMethod,
        userId: s.userId,
        patientId: s.patientId,
        fullName: s.fullName,
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
  const userId = useSession((s) => s.userId);
  const fullName = useSession((s) => s.fullName);
  if (!role) return null;
  return userId ? { role, ...DEMO_USERS[role], id: userId, name: fullName ?? DEMO_USERS[role].name } : { role, ...DEMO_USERS[role] };
}

/** The signed-in patient's record id: their own after a real sign-in, Rekha's in the demo. */
export function currentPatientId(): string {
  return useSession.getState().patientId ?? DEMO_IDS.patientRecord;
}

/** True when a real (non-demo) patient is signed in, whose records must not be the demo seed. */
export const isRealPatient = () => {
  const s = useSession.getState();
  return s.role === 'patient' && !!s.patientId && s.patientId !== DEMO_IDS.patientRecord;
};
