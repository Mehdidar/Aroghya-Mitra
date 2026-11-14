import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useSession } from '@/features/shared/state/session';

import { formatTime } from './format';
import { syncRemindersOnDevice } from './reminders';
import type { Appointment } from './types';

/**
 * Returns sync(appointments): schedules the day-before and hour-before
 * reminders for the signed-in patient's own appointments and removes stale
 * ones. Does nothing on an ASHA's or doctor's phone (booking for someone else).
 */
export function useAppointmentReminders() {
  const { t } = useTranslation('appointments');
  const { language } = useLanguage();
  const role = useSession((s) => s.role);
  return useCallback(
    async (appointments: Appointment[]) => {
      if (role !== 'patient') return 'unsupported' as const;
      const byId = new Map(appointments.map((a) => [a.id, a]));
      return syncRemindersOnDevice(
        appointments,
        { channelName: t('reminders:notifChannel'), taken: t('reminders:taken'), skip: t('reminders:skip') },
        (r) => {
          const a = byId.get(r.appointmentId);
          return {
            title: r.lead === 'day' ? t('reminder.dayTitle') : t('reminder.hourTitle'),
            body: t('reminder.body', { doctor: a?.doctorName ?? t('doctorFallback'), facility: a?.facilityName ?? t('facilityFallback'), time: a ? formatTime(a.startsAt, language) : '' }),
          };
        },
      );
    },
    [role, t, language],
  );
}
