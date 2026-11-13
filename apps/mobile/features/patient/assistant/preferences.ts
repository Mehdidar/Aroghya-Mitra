/**
 * The patient's food preferences for the health assistant: diet type, no
 * onion/garlic, and foods they avoid. Kept on the phone (AsyncStorage) and sent
 * with every chat request (no database column: the server only uses them for
 * that one answer).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ChatDiet } from '@/features/patient/chat/chatClient';

export type DietType = NonNullable<ChatDiet['type']>;
export const DIET_TYPES: readonly DietType[] = ['veg', 'nonveg', 'vegan', 'jain'] as const;

export const MAX_AVOID_ITEMS = 10;
export const MAX_AVOID_LENGTH = 40;

export type DietPreferencesState = {
  dietType: DietType | null;
  noOnionGarlic: boolean;
  avoid: string[];
  setDietType: (t: DietType | null) => void;
  setNoOnionGarlic: (v: boolean) => void;
  /** Accepts a comma-separated list as typed ("brinjal, peanuts"). */
  setAvoidText: (text: string) => void;
  reset: () => void;
};

/** "brinjal, Peanuts,, brinjal" → ['brinjal', 'Peanuts']: trimmed, unique (ignoring case), capped. */
export function parseAvoidList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,،\n;]+/)) {
    const item = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_AVOID_LENGTH);
    if (item && !out.some((x) => x.toLowerCase() === item.toLowerCase())) out.push(item);
    if (out.length >= MAX_AVOID_ITEMS) break;
  }
  return out;
}

export const useDietPreferences = create<DietPreferencesState>()(
  persist(
    (set) => ({
      dietType: null,
      noOnionGarlic: false,
      avoid: [],
      setDietType: (dietType) => set({ dietType }),
      setNoOnionGarlic: (noOnionGarlic) => set({ noOnionGarlic }),
      setAvoidText: (text) => set({ avoid: parseAvoidList(text) }),
      reset: () => set({ dietType: null, noOnionGarlic: false, avoid: [] }),
    }),
    {
      name: 'aroghya-diet-preferences-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ dietType, noOnionGarlic, avoid }) => ({ dietType, noOnionGarlic, avoid }),
    },
  ),
);

/** The preferences as the chat request sends them, or null when nothing is set. */
export function dietForChat(s: Pick<DietPreferencesState, 'dietType' | 'noOnionGarlic' | 'avoid'> = useDietPreferences.getState()): ChatDiet | null {
  const diet: ChatDiet = {};
  if (s.dietType) diet.type = s.dietType;
  if (s.noOnionGarlic) diet.noOnionGarlic = true;
  if (s.avoid.length) diet.avoid = s.avoid.slice(0, MAX_AVOID_ITEMS);
  return Object.keys(diet).length ? diet : null;
}
