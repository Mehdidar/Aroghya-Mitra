/**
 * Local dose notifications through P2's expo-notifications adapter. Web and
 * Jest have no scheduler: both return { state: 'unsupported' } quietly.
 */
import { Platform } from 'react-native';

import { planNotifications, type ReminderMedicine } from '@am/patient-ai';
import { ensureNotificationPermission, syncReminders, type ReminderCopy } from '@am/patient-ai/reminders/notifications';

import type { ReminderPlanItem } from '@/features/shared/data/recordsStore';

export type NotificationOutcome = { state: 'granted' | 'denied' | 'blocked' | 'unsupported'; scheduled: number };

export function toReminderMedicine(r: ReminderPlanItem): ReminderMedicine {
  return { id: r.id, name: r.name, dose: r.dose, slots: r.slots, mealRelation: r.mealRelation, startDate: r.startDate, durationDays: r.durationDays, asNeeded: r.asNeeded, paused: r.paused };
}

export async function scheduleDoseNotifications(items: ReminderPlanItem[], copy: ReminderCopy, now = new Date()): Promise<NotificationOutcome> {
  if (Platform.OS === 'web' || process.env.JEST_WORKER_ID) return { state: 'unsupported', scheduled: 0 };
  let N: typeof import('expo-notifications');
  try {
    N = await import('expo-notifications');
  } catch {
    return { state: 'unsupported', scheduled: 0 };
  }
  const state = await ensureNotificationPermission(N as never, { OS: Platform.OS, Version: Platform.Version }, copy);
  if (state !== 'granted') return { state, scheduled: 0 };
  const plan = planNotifications(items.map(toReminderMedicine), now);
  const r = await syncReminders(N as never, plan, copy);
  return { state, scheduled: r.scheduled };
}
