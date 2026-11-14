/**
 * Local reminders for the patient's own appointments: one a day before and one
 * an hour before. Uses P2's expo-notifications adapter types and permission
 * helper (packages/patient-ai/reminders/notifications.ts) and touches only its
 * own notifications (data.kind = 'appointment-reminder'), never dose reminders.
 *
 * syncAppointmentReminders makes the scheduled set match the active
 * appointments exactly, so a cancel or reschedule (by the patient, or by the
 * PHC, seen on the next refresh) removes the old reminders.
 */
import { Platform } from 'react-native';

import { DOSE_CHANNEL_ID, ensureNotificationPermission, type NotificationsModule, type ReminderCopy } from '@am/patient-ai/reminders/notifications';

import { isActiveStatus, type Appointment } from './types';

export const APPOINTMENT_REMINDER_KIND = 'appointment-reminder';
const HOUR = 3_600_000;

export type ReminderLead = 'day' | 'hour';
export interface AppointmentReminder {
  id: string;
  appointmentId: string;
  lead: ReminderLead;
  at: Date;
}

/** Reminders still in the future for active appointments. */
export function planAppointmentReminders(appointments: Pick<Appointment, 'id' | 'startsAt' | 'status'>[], now: Date): AppointmentReminder[] {
  const out: AppointmentReminder[] = [];
  for (const a of appointments) {
    if (!isActiveStatus(a.status)) continue;
    const start = Date.parse(a.startsAt);
    for (const [lead, before] of [['day', 24 * HOUR], ['hour', HOUR]] as const) {
      const at = new Date(start - before);
      if (at.getTime() > now.getTime()) out.push({ id: `appt-${a.id}-${lead}`, appointmentId: a.id, lead, at });
    }
  }
  return out;
}

export type ReminderText = (r: AppointmentReminder) => { title: string; body: string };

export async function syncAppointmentReminders(N: NotificationsModule, plan: AppointmentReminder[], text: ReminderText): Promise<{ scheduled: number; cancelled: number; kept: number }> {
  const existing = (await N.getAllScheduledNotificationsAsync()).filter((n) => n.content.data?.kind === APPOINTMENT_REMINDER_KIND);
  const wanted = new Map(plan.map((p) => [p.id, p]));
  const result = { scheduled: 0, cancelled: 0, kept: 0 };
  for (const n of existing) {
    const p = wanted.get(n.identifier);
    if (p && n.content.data?.at === p.at.toISOString()) {
      wanted.delete(n.identifier);
      result.kept++;
    } else {
      await N.cancelScheduledNotificationAsync(n.identifier);
      result.cancelled++;
    }
  }
  for (const p of wanted.values()) {
    const { title, body } = text(p);
    await N.scheduleNotificationAsync({
      identifier: p.id,
      content: { title, body, sound: 'default', data: { kind: APPOINTMENT_REMINDER_KIND, appointmentId: p.appointmentId, at: p.at.toISOString() } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: DOSE_CHANNEL_ID },
    });
    result.scheduled++;
  }
  return result;
}

/**
 * On the patient's phone: ask permission (once) and sync. Web and Jest have no
 * scheduler and return 'unsupported'. Never throws: a reminder failure must not
 * undo a booking.
 */
export async function syncRemindersOnDevice(
  appointments: Appointment[],
  copy: Pick<ReminderCopy, 'channelName' | 'taken' | 'skip'>,
  text: ReminderText,
  now = new Date(),
): Promise<'granted' | 'denied' | 'blocked' | 'unsupported'> {
  if (Platform.OS === 'web' || process.env.JEST_WORKER_ID) return 'unsupported';
  try {
    const N = (await import('expo-notifications')) as unknown as NotificationsModule;
    const state = await ensureNotificationPermission(N, { OS: Platform.OS, Version: Platform.Version }, copy);
    if (state !== 'granted') return state;
    await syncAppointmentReminders(N, planAppointmentReminders(appointments, now), text);
    return state;
  } catch {
    return 'unsupported';
  }
}
