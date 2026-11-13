/**
 * The dose timeline for the Reminders tab: the store's reminder plan expanded
 * with P2's schedule maths, joined with the user's Taken / Skip taps.
 */
import { useMemo } from 'react';

import { adherenceRate, adherenceStreak, buildTimeline, expandDoses, type Dose, type DoseLogEntry, type DoseSlot, type TimelineItem } from '@am/patient-ai';

import { useRecords, type DoseAction } from '@/features/shared/data/recordsStore';
import { toReminderMedicine } from '@/features/patient/prescription/notifications';

export const SLOT_ORDER: DoseSlot[] = ['morning', 'afternoon', 'evening', 'night'];

export function toLog(actions: DoseAction[]): DoseLogEntry[] {
  return actions.map((a) => ({ doseId: a.doseId, status: a.status, at: new Date(a.at) }));
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function computeReminders(reminders: Parameters<typeof toReminderMedicine>[0][], actions: DoseAction[], now: Date) {
  const meds = reminders.filter((r) => !r.paused).map(toReminderMedicine);
  const log = toLog(actions);
  const from = new Date(dayStart(now).getTime() - 7 * 86_400_000);
  const to = new Date(dayStart(now).getTime() + 2 * 86_400_000);
  const doses: Dose[] = meds.flatMap((m) => expandDoses(m, from, to));
  const today = dayStart(now).getTime();
  const todayDoses = doses.filter((d) => dayStart(d.at).getTime() === today);
  const timeline: TimelineItem[] = buildTimeline(todayDoses, log, now);
  const bySlot = SLOT_ORDER.map((slot) => ({ slot, items: timeline.filter((t) => t.dose.slot === slot) })).filter((g) => g.items.length);
  return {
    meds,
    timeline,
    bySlot,
    streak: adherenceStreak(doses, log, now),
    rate: adherenceRate(doses, log, now, 7),
    takenToday: timeline.filter((t) => t.status === 'taken').length,
    dueNow: timeline.filter((t) => t.status === 'due').length,
  };
}

export function useReminders(now = new Date()) {
  const reminders = useRecords((s) => s.reminders);
  const actions = useRecords((s) => s.doseActions);
  const logDose = useRecords((s) => s.logDose);
  const data = useMemo(() => computeReminders(reminders, actions, now), [reminders, actions, now]);
  return { ...data, logDose };
}
