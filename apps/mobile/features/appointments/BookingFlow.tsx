/**
 * Book (or move) a PHC appointment: choose a day → a real published slot →
 * reason → confirm. Shared by the patient screen and, with `patientId`, by an
 * ASHA booking for a patient in their caseload.
 *
 * Only slots the server computed from published doctor hours are shown. With
 * none published, the screen says so and offers the PHC's number if known.
 * Offline, it says booking needs the internet; nothing is queued.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { feedback } from '@/features/shared/feedback';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, ErrorState, Heading, Icon, IconButton, PrimaryButton, SecondaryButton, Skeleton, Text, TextField } from '@/features/shared/ui';

import { appointmentsApi, classifyError, type AppointmentError } from './api';
import { CallPhcButton, Chip, ConfirmDialog, InfoLine, Notice } from './components';
import { formatDay, formatTime, formatWhen, istDateOf } from './format';
import { useAppointmentReminders } from './useAppointmentReminders';
import type { Appointment, Slot, SlotsResponse } from './types';

type Load = { kind: 'loading' } | { kind: 'offline' } | { kind: 'error' } | { kind: 'ready'; data: SlotsResponse; current: Appointment | null };

const slotKey = (s: Pick<Slot, 'doctorId' | 'startsAt'>) => `${s.doctorId}|${s.startsAt}`;

export type BookingFlowProps = {
  /** Booking for someone else (ASHA / staff). Omit for the signed-in patient. */
  patientId?: string | null;
  patientName?: string | null;
  /** Move this appointment instead of booking a new one. */
  rescheduleId?: string | null;
  onBack: () => void;
  onDone: (a: Appointment) => void;
};

export function BookingFlow({ patientId, patientName, rescheduleId, onBack, onDone }: BookingFlowProps) {
  const { t } = useTranslation('appointments');
  const { language } = useLanguage();
  const th = useTheme();
  const syncReminders = useAppointmentReminders();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [date, setDate] = useState<string | null>(null);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmMove, setConfirmMove] = useState(false);
  const [done, setDone] = useState<Appointment | null>(null);

  const errorText = useCallback(
    (e: AppointmentError) => (e.kind === 'offline' ? t('offlineBody') : t(`errors.${e.reason}`, { defaultValue: t('errors.generic') })),
    [t],
  );

  // Fetching is pure; applying the answer sets state (in a promise callback, never synchronously in an effect).
  const fetchSlots = useCallback(
    (): Promise<Load> =>
      Promise.all([appointmentsApi.slots(), rescheduleId ? appointmentsApi.mine(patientId) : Promise.resolve(null)]).then(
        ([data, mine]): Load => ({ kind: 'ready', data, current: mine?.appointments.find((a) => a.id === rescheduleId) ?? null }),
        (e): Load => ({ kind: classifyError(e).kind === 'offline' ? 'offline' : 'error' }),
      ),
    [patientId, rescheduleId],
  );
  const apply = useCallback((next: Load) => {
    setLoad(next);
    if (next.kind !== 'ready') return;
    const { slots } = next.data;
    setDate((d) => (d && slots.some((s) => istDateOf(s.startsAt) === d) ? d : slots[0] ? istDateOf(slots[0].startsAt) : null));
    setPicked((p) => (p && slots.some((s) => slotKey(s) === slotKey(p)) ? p : null));
  }, []);
  const refresh = useCallback(() => {
    setLoad({ kind: 'loading' });
    return fetchSlots().then(apply);
  }, [fetchSlots, apply]);

  useEffect(() => {
    let alive = true;
    void fetchSlots().then((next) => alive && apply(next));
    return () => {
      alive = false;
    };
  }, [fetchSlots, apply]);

  const data = load.kind === 'ready' ? load.data : null;
  const days = useMemo(() => [...new Set((data?.slots ?? []).map((s) => istDateOf(s.startsAt)))], [data]);
  const daySlots = useMemo(() => (data?.slots ?? []).filter((s) => istDateOf(s.startsAt) === date), [data, date]);
  const doctorName = useCallback((id: string) => data?.doctors.find((d) => d.id === id)?.name ?? t('doctorFallback'), [data, t]);
  const doctorsToday = useMemo(() => [...new Set(daySlots.map((s) => s.doctorId))], [daySlots]);
  const facilityName = data?.facility.name || t('facilityFallback');

  const submit = async () => {
    if (!picked) {
      setMessage(t('book.chooseTime'));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = rescheduleId
        ? await appointmentsApi.reschedule(rescheduleId, { startsAt: picked.startsAt, doctorId: picked.doctorId })
        : await appointmentsApi.book({ patientId: patientId ?? null, doctorId: picked.doctorId, startsAt: picked.startsAt, reason: reason.trim() || null });
      setConfirmMove(false);
      setDone(res.appointment);
      feedback.success(rescheduleId ? t('book.rescheduled') : t('book.booked'));
      // Reminders follow the patient's full list (also drops the old time's reminders after a move).
      if (!patientId) void appointmentsApi.mine().then((m) => syncReminders(m.appointments)).catch(() => syncReminders([res.appointment]));
    } catch (e) {
      const err = classifyError(e);
      setConfirmMove(false);
      setMessage(errorText(err));
      if (err.kind === 'server' && (err.reason === 'slot_taken' || err.reason === 'slot_unavailable')) void refresh();
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space[3] }}>
      <IconButton icon="arrow-back" accessibilityLabel={t('actions.back')} onPress={onBack} flipInRTL testID="book-back" />
      <View style={{ flex: 1 }}>
        <Heading variant="h2">{rescheduleId ? t('book.rescheduleTitle') : t('book.title')}</Heading>
        {patientName ? (
          <Text tone="secondary" variant="bodySmall">
            {t('book.forPatient', { name: patientName })}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (done) {
    return (
      <View style={{ gap: th.space[4] }} testID="book-done">
        {header}
        <Card radius="xl" padding="lg">
          <View style={{ alignItems: 'center', gap: th.space[3] }} accessible accessibilityRole="summary">
            <Icon name="checkmark-circle" size={48} color={th.colors.status.success.icon} />
            <Text variant="h3" align="center">
              {rescheduleId ? t('book.rescheduled') : t('book.booked')}
            </Text>
            <Text align="center">{formatWhen(done.startsAt, language)}</Text>
            <Text align="center" tone="secondary">
              {[done.doctorName ?? t('doctorFallback'), done.facilityName ?? facilityName].join(' · ')}
            </Text>
            {!patientId ? (
              <Text variant="bodySmall" tone="tertiary" align="center">
                {t('book.reminderNote')}
              </Text>
            ) : null}
          </View>
        </Card>
        <PrimaryButton label={t('actions.done')} onPress={() => onDone(done)} testID="book-finish" />
      </View>
    );
  }

  return (
    <View style={{ gap: th.space[4] }}>
      {header}

      {load.kind === 'loading' ? (
        <View style={{ gap: th.space[3] }} accessibilityLabel={t('loading')} testID="book-loading">
          <Skeleton height={48} />
          <Skeleton height={120} />
        </View>
      ) : load.kind === 'offline' ? (
        <View style={{ gap: th.space[3] }}>
          <Notice icon="cloud-offline-outline" title={t('offlineTitle')} body={t('offlineBody')} testID="book-offline" />
          <SecondaryButton label={t('actions.retry')} icon="refresh" onPress={() => void refresh()} testID="book-retry" />
        </View>
      ) : load.kind === 'error' ? (
        <ErrorState title={t('errorTitle')} body={t('errorBody')} retryLabel={t('actions.retry')} onRetry={() => void refresh()} testID="book-error" />
      ) : !load.data.published ? (
        // The honest empty state: nobody has published hours, so there is nothing to book in the app.
        <EmptyState
          icon="calendar-outline"
          title={t('book.emptyTitle')}
          body={load.data.facility.phone ? t('book.emptyBodyPhone', { facility: facilityName, phone: load.data.facility.phone }) : t('book.emptyBodyNoPhone', { facility: facilityName })}
          action={<CallPhcButton phone={load.data.facility.phone} />}
          testID="book-empty"
        />
      ) : !load.data.slots.length ? (
        <EmptyState
          icon="calendar-clear-outline"
          title={t('book.fullTitle')}
          body={load.data.facility.phone ? t('book.fullBodyPhone', { facility: facilityName, phone: load.data.facility.phone }) : t('book.fullBodyNoPhone', { facility: facilityName })}
          action={<CallPhcButton phone={load.data.facility.phone} />}
          testID="book-full"
        />
      ) : (
        <>
          {load.current ? <Notice icon="time-outline" title={t('book.currentTime')} body={formatWhen(load.current.startsAt, language)} tone="surface" testID="book-current" /> : null}

          <View style={{ gap: th.space[2] }}>
            <Text variant="label" accessibilityRole="header">
              {t('book.stepDate')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: th.space[2] }}>
              {days.map((d) => (
                <Chip
                  key={d}
                  label={formatDay(d, language)}
                  accessibilityLabel={formatDay(d, language, true)}
                  selected={d === date}
                  onPress={() => {
                    setDate(d);
                    setPicked(null);
                  }}
                  testID={`day-${d}`}
                />
              ))}
            </ScrollView>
          </View>

          <View style={{ gap: th.space[2] }}>
            <Text variant="label" accessibilityRole="header">
              {t('book.stepTime')}
            </Text>
            {doctorsToday.map((doc) => (
              <View key={doc} style={{ gap: th.space[2] }}>
                <InfoLine icon="medkit-outline" text={doctorName(doc)} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
                  {daySlots
                    .filter((s) => s.doctorId === doc)
                    .map((s) => (
                      <Chip
                        key={slotKey(s)}
                        label={formatTime(s.startsAt, language)}
                        accessibilityLabel={`${formatTime(s.startsAt, language)}, ${doctorName(s.doctorId)}`}
                        selected={!!picked && slotKey(picked) === slotKey(s)}
                        onPress={() => {
                          setPicked(s);
                          setMessage(null);
                        }}
                        testID={`slot-${s.startsAt}`}
                      />
                    ))}
                </View>
              </View>
            ))}
          </View>

          {!rescheduleId ? (
            <TextField label={t('book.stepReason')} placeholder={t('book.reasonPlaceholder')} value={reason} onChangeText={setReason} maxLength={300} multiline testID="book-reason" />
          ) : null}

          <Card tone="muted" radius="xl" testID="book-summary">
            <Text variant="label">{t('book.review')}</Text>
            <InfoLine icon="time-outline" text={picked ? formatWhen(picked.startsAt, language) : t('book.chooseTime')} />
            <InfoLine icon="medkit-outline" text={picked ? doctorName(picked.doctorId) : doctorsToday.map(doctorName).join(', ')} />
            <InfoLine icon="business-outline" text={facilityName} />
          </Card>

          {message ? (
            <Text tone="danger" accessibilityRole="alert" testID="book-message">
              {message}
            </Text>
          ) : null}

          <PrimaryButton
            label={rescheduleId ? t('book.confirmReschedule') : t('book.confirm')}
            icon="checkmark-circle"
            onPress={() => (rescheduleId && picked ? setConfirmMove(true) : void submit())}
            loading={busy && !confirmMove}
            disabled={!picked}
            testID="book-confirm"
          />
          <Text variant="caption" tone="tertiary">
            {t('book.timeZoneNote')}
          </Text>

          <ConfirmDialog
            visible={confirmMove}
            title={t('rescheduleDialog.title')}
            body={t('rescheduleDialog.body', { from: load.current ? formatWhen(load.current.startsAt, language) : '', to: picked ? formatWhen(picked.startsAt, language) : '' })}
            confirmLabel={t('rescheduleDialog.confirm')}
            cancelLabel={t('actions.keep')}
            onConfirm={() => void submit()}
            onCancel={() => setConfirmMove(false)}
            busy={busy}
            testID="reschedule-dialog"
          />
        </>
      )}
    </View>
  );
}
