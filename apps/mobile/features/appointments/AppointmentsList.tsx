/**
 * A patient's appointments: upcoming (reschedule / cancel), then past visits
 * as consultation history, merging booked appointments from the server with
 * consultations already in the records store on this phone.
 *
 * With `patientId` (an ASHA viewing a patient) the records-store consultations
 * are not mixed in (that store holds the signed-in patient's own records).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { DEMO_USERS, sameRecord } from '@am/shared';

import { useRecords } from '@/features/shared/data/recordsStore';
import { feedback } from '@/features/shared/feedback';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { currentPatientId } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, ErrorState, PrimaryButton, SecondaryButton, SectionHeader, Skeleton, Text } from '@/features/shared/ui';

import { appointmentsApi, classifyError } from './api';
import { AppointmentCard, ConfirmDialog, InfoLine, Notice } from './components';
import { formatDay, formatWhen, istDateOf } from './format';
import { useAppointmentReminders } from './useAppointmentReminders';
import { isActiveStatus, type Appointment } from './types';

type Load = { kind: 'loading' } | { kind: 'offline' } | { kind: 'error' } | { kind: 'ready'; appointments: Appointment[]; at: number };

export type AppointmentsListProps = {
  patientId?: string | null;
  onBook: () => void;
  onReschedule: (a: Appointment) => void;
  /** Bumped by the screen when it regains focus, to reload. */
  refreshKey?: number;
};

// Names for the demo cast; other doctors show as "PHC doctor" (the records store keeps ids, not names).
const doctorNameFor = (id: string) => (sameRecord(id, DEMO_USERS.doctor.id) ? DEMO_USERS.doctor.name : null);

export function AppointmentsList({ patientId, onBook, onReschedule, refreshKey }: AppointmentsListProps) {
  const { t } = useTranslation('appointments');
  const { language } = useLanguage();
  const th = useTheme();
  const syncReminders = useAppointmentReminders();
  const consultations = useRecords((s) => s.consultations);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchList = useCallback(
    (): Promise<Load> =>
      appointmentsApi.mine(patientId).then(
        (res): Load => ({ kind: 'ready', appointments: res.appointments, at: Date.now() }),
        (e): Load => ({ kind: classifyError(e).kind === 'offline' ? 'offline' : 'error' }),
      ),
    [patientId],
  );
  const apply = useCallback(
    (next: Load) => {
      setLoad(next);
      if (next.kind === 'ready' && !patientId) void syncReminders(next.appointments);
    },
    [patientId, syncReminders],
  );
  const refresh = useCallback(() => fetchList().then(apply), [fetchList, apply]);

  useEffect(() => {
    let alive = true;
    void fetchList().then((next) => alive && apply(next));
    return () => {
      alive = false;
    };
  }, [fetchList, apply, refreshKey]);

  const { upcoming, pastAppointments } = useMemo(() => {
    if (load.kind !== 'ready') return { upcoming: [] as Appointment[], pastAppointments: [] as Appointment[] };
    // "Now" is the moment the list was loaded, so a render never reshuffles it.
    const up = load.appointments.filter((a) => isActiveStatus(a.status) && Date.parse(a.endsAt) > load.at).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { upcoming: up, pastAppointments: load.appointments.filter((a) => !up.includes(a) && a.cancelledReason !== 'rescheduled') };
  }, [load]);
  const ownConsultations = useMemo(() => {
    if (patientId) return [];
    const mine = currentPatientId();
    return consultations.filter((c) => sameRecord(c.patientId, mine));
  }, [consultations, patientId]);

  const past = useMemo(
    () =>
      [
        ...pastAppointments.map((a) => ({ kind: 'appointment' as const, at: a.startsAt, a })),
        ...ownConsultations.map((c) => ({ kind: 'consultation' as const, at: c.startedAt, c })),
      ].sort((x, y) => y.at.localeCompare(x.at)),
    [pastAppointments, ownConsultations],
  );

  const doCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    setMessage(null);
    try {
      await appointmentsApi.cancel(cancelling.id);
      feedback.success(t('cancelDialog.done'));
      setCancelling(null);
      await refresh();
    } catch (e) {
      const err = classifyError(e);
      setCancelling(null);
      setMessage(err.kind === 'offline' ? t('offlineBody') : t(`errors.${err.reason}`, { defaultValue: t('errors.generic') }));
      feedback.warn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: th.space[4] }}>
      <PrimaryButton label={t('bookCta')} icon="calendar" onPress={onBook} testID="appointments-book" />

      {load.kind === 'offline' ? (
        <Notice icon="cloud-offline-outline" title={t('offlineTitle')} body={t('offlineListBody')} testID="appointments-offline">
          <SecondaryButton label={t('actions.retry')} icon="refresh" onPress={() => void refresh()} />
        </Notice>
      ) : null}
      {message ? (
        <Text tone="danger" accessibilityRole="alert" testID="appointments-message">
          {message}
        </Text>
      ) : null}

      <SectionHeader title={t('upcoming')} />
      {load.kind === 'loading' ? (
        <View style={{ gap: th.space[3] }} accessibilityLabel={t('loading')}>
          <Skeleton height={110} />
        </View>
      ) : load.kind === 'error' ? (
        <ErrorState title={t('errorTitle')} body={t('errorBody')} retryLabel={t('actions.retry')} onRetry={() => void refresh()} testID="appointments-error" />
      ) : load.kind === 'ready' && !upcoming.length ? (
        <EmptyState icon="calendar-outline" title={t('noUpcoming')} body={t('noUpcomingBody')} testID="appointments-none" />
      ) : (
        upcoming.map((a) => (
          <AppointmentCard
            key={a.id}
            appointment={a}
            testID={`appointment-${a.id}`}
            actions={
              <>
                <SecondaryButton label={t('actions.reschedule')} icon="swap-horizontal" onPress={() => onReschedule(a)} testID={`reschedule-${a.id}`} style={{ flexGrow: 1 }} />
                <SecondaryButton label={t('actions.cancel')} icon="close-circle-outline" onPress={() => setCancelling(a)} testID={`cancel-${a.id}`} style={{ flexGrow: 1 }} />
              </>
            }
          />
        ))
      )}

      <SectionHeader title={t('past')} />
      {!past.length ? (
        <Text tone="secondary" testID="appointments-no-past">
          {t('noPast')}
        </Text>
      ) : (
        past.map((p) =>
          p.kind === 'appointment' ? (
            <AppointmentCard key={`a-${p.a.id}`} appointment={p.a} testID={`past-${p.a.id}`} />
          ) : (
            <Card key={`c-${p.c.id}`} radius="xl" testID={`consultation-${p.c.id}`}>
              <View accessible style={{ gap: th.space[2] }}>
                <Text variant="title">{t('consultation')}</Text>
                <Text variant="bodySmall" tone="secondary">
                  {formatDay(istDateOf(p.c.startedAt), language, true)}
                </Text>
                <InfoLine icon="medkit-outline" text={doctorNameFor(p.c.doctorId) ?? t('doctorFallback')} />
                {p.c.diagnosis ? <InfoLine icon="document-text-outline" text={p.c.diagnosis} /> : null}
                {p.c.followUpDate ? <InfoLine icon="calendar-outline" text={t('followUp', { date: formatDay(p.c.followUpDate, language, true) })} /> : null}
              </View>
            </Card>
          ),
        )
      )}

      <ConfirmDialog
        visible={!!cancelling}
        title={t('cancelDialog.title')}
        body={cancelling ? t('cancelDialog.body', { when: formatWhen(cancelling.startsAt, language), doctor: cancelling.doctorName ?? t('doctorFallback') }) : undefined}
        confirmLabel={t('cancelDialog.confirm')}
        cancelLabel={t('actions.keep')}
        onConfirm={() => void doCancel()}
        onCancel={() => setCancelling(null)}
        busy={busy}
        destructive
        testID="cancel-dialog"
      />
    </View>
  );
}
