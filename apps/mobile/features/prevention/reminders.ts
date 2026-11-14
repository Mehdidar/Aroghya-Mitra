/**
 * "Remind me": one local notification at 9 am on the day an item is due (or
 * tomorrow at 9 if that day has passed), through P2's notification helpers
 * (permission + channel from packages/patient-ai/reminders/notifications.ts).
 * Dose reminders are untouched: syncReminders only manages its own 'dose-reminder' kind.
 */
import { Platform } from 'react-native';

import { DOSE_CHANNEL_ID, ensureNotificationPermission, type NotificationsModule } from '@am/patient-ai/reminders/notifications';

export const PREVENTION_KIND = 'prevention-reminder';

export type RemindOutcome = { state: 'scheduled'; at: Date } | { state: 'denied' | 'blocked' | 'unsupported' };

/** The moment to remind: 9:00 local on `dueFrom`, never in the past. */
export function reminderTime(dueFrom: string | null, now = new Date()): Date {
  const at = dueFrom ? new Date(`${dueFrom}T09:00:00`) : new Date(now);
  if (!dueFrom || at.getTime() <= now.getTime()) {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    t.setHours(9, 0, 0, 0);
    return t;
  }
  return at;
}

export async function remindAbout(
  item: { id: string; dueFrom: string | null },
  text: { title: string; body: string; channelName: string; taken: string; skip: string },
  now = new Date(),
  N?: NotificationsModule,
): Promise<RemindOutcome> {
  let mod = N;
  if (!mod) {
    if (Platform.OS === 'web' || process.env.JEST_WORKER_ID) return { state: 'unsupported' };
    try {
      mod = (await import('expo-notifications')) as unknown as NotificationsModule;
    } catch {
      return { state: 'unsupported' };
    }
  }
  const state = await ensureNotificationPermission(mod, { OS: Platform.OS, Version: Platform.Version }, text);
  if (state !== 'granted') return { state };
  const at = reminderTime(item.dueFrom, now);
  const identifier = `prevention:${item.id}`;
  await mod.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
  await mod.scheduleNotificationAsync({
    identifier,
    content: { title: text.title, body: text.body, sound: 'default', data: { kind: PREVENTION_KIND, itemId: item.id } },
    trigger: { type: mod.SchedulableTriggerInputTypes.DATE, date: at, channelId: DOSE_CHANNEL_ID },
  });
  return { state: 'scheduled', at };
}
