/**
 * Real step counting from the phone's motion sensor (expo-sensors Pedometer).
 *
 *  - iPhone: the motion chip counts all day, even when the app is closed; we
 *    read today's total and the last 7 days from it.
 *  - Android: the sensor only reports steps while we listen, so steps are
 *    counted while Aroghya Mitra is open and kept per day on the phone. The
 *    card says so. (All-day counts on Android need Health Connect.)
 *  - Web / no sensor: the card says step counting works on the phone.
 *
 * Nothing is invented: with no sensor or no permission there is no number.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_STEP_GOAL, addSteps, dayKey, lastDays, startOfDay } from './stepsLogic';

type StepsStore = { days: Record<string, number>; goal: number; add: (key: string, delta: number) => void; setGoal: (g: number) => void };

export const useStepsStore = create<StepsStore>()(
  persist(
    (set) => ({
      days: {},
      goal: DEFAULT_STEP_GOAL,
      add: (key, delta) => set((s) => ({ days: addSteps(s.days, key, delta) })),
      setGoal: (goal) => set({ goal }),
    }),
    { name: 'aroghya-steps-v1', storage: createJSONStorage(() => AsyncStorage), partialize: ({ days, goal }) => ({ days, goal }) },
  ),
);

export type StepsState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'denied'; canAsk: boolean }
  | { status: 'ready'; today: number; week: { date: Date; steps: number }[]; allDay: boolean };

type PedometerModule = typeof import('expo-sensors').Pedometer;
function pedometer(): PedometerModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('expo-sensors') as typeof import('expo-sensors')).Pedometer;
  } catch {
    return null;
  }
}

export function useSteps(): { state: StepsState; goal: number; requestPermission: () => Promise<void> } {
  const [state, setState] = useState<StepsState>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const goal = useStepsStore((s) => s.goal);
  const days = useStepsStore((s) => s.days);
  const add = useStepsStore((s) => s.add);
  const allDay = Platform.OS === 'ios';

  useEffect(() => {
    const P = pedometer();
    let alive = true;
    let sub: { remove: () => void } | null = null;
    (async () => {
      if (!P || !(await P.isAvailableAsync().catch(() => false))) return alive && setState({ status: 'unavailable' });
      let perm = await P.getPermissionsAsync().catch(() => null);
      if (perm && !perm.granted && perm.canAskAgain) perm = await P.requestPermissionsAsync().catch(() => perm);
      if (!perm?.granted) return alive && setState({ status: 'denied', canAsk: perm?.canAskAgain ?? false });

      if (allDay) {
        // iPhone: the motion chip's own history, today and the 6 days before.
        const now = new Date();
        const week = await Promise.all(
          lastDays(now).map(async (d) => {
            const end = dayKey(d) === dayKey(now) ? now : new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
            const r = await P.getStepCountAsync(d, end).catch(() => ({ steps: 0 }));
            return { date: d, steps: r.steps };
          }),
        );
        if (!alive) return;
        const base = week[week.length - 1].steps;
        setState({ status: 'ready', today: base, week, allDay: true });
        sub = P.watchStepCount((r) => alive && setState((s) => (s.status === 'ready' ? { ...s, today: base + r.steps, week: s.week.map((w, i) => (i === s.week.length - 1 ? { ...w, steps: base + r.steps } : w)) } : s)));
      } else {
        // Android: count while open, store per day.
        let last = 0;
        setState({ status: 'ready', today: 0, week: [], allDay: false });
        sub = P.watchStepCount((r) => {
          const delta = r.steps - last;
          last = r.steps;
          add(dayKey(new Date()), delta);
        });
      }
    })();
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [add, allDay, tick]);

  // Android: today's and the week's numbers come from the stored per-day totals.
  const now = new Date();
  const shown: StepsState =
    state.status === 'ready' && !state.allDay
      ? { ...state, today: days[dayKey(now)] ?? 0, week: lastDays(now).map((d) => ({ date: d, steps: days[dayKey(d)] ?? 0 })) }
      : state;

  const requestPermission = useCallback(async () => {
    const P = pedometer();
    if (!P) return;
    await P.requestPermissionsAsync().catch(() => null);
    setTick((n) => n + 1);
  }, []);

  return { state: shown, goal, requestPermission };
}

export { startOfDay };
