import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { appointmentsApi, classifyError } from '@/features/appointments/api';
import { AppointmentCard, ConfirmDialog, Notice } from '@/features/appointments/components';
import { addDays, formatDay, formatWhen, istDateOf } from '@/features/appointments/format';
import { isActiveStatus, type Appointment } from '@/features/appointments/types';
import { feedback } from '@/features/shared/feedback';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useSession } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { EmptyState, ErrorState, Heading, IconButton, PrimaryButton, Screen, SecondaryButton, Skeleton, Text } from '@/features/shared/ui';

type Action = 'confirm' | 'complete' | 'no-show' | 'cancel';
type Load = { kind: 'loading' } | { kind: 'offline' } | { kind: 'error' } | { kind: 'ready'; list: Appointment[]; at: number };

/**
 * Doctor / admin: the day's appointments (doctor: their own; admin: the whole
 * PHC). Confirm, complete, mark no-show (once the time has come) or cancel.
 */
export default function DoctorAppointmentsScreen() {
  const { t } = useTranslation('appointments');
  const { language } = useLanguage();
  const theme = useTheme();
  const role = useSession((s) => s.role);
  const today = istDateOf(new Date());
  const [date, setDate] = useState(today);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [pending, setPending] = useState<{ a: Appointment; action: Action } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async (d: string) => {
    try {
      const res = await appointmentsApi.doctorDay(d);
      setLoad({ kind: 'ready', list: res.appointments, at: Date.now() });
    } catch (e) {
      setLoad({ kind: classifyError(e).kind === 'offline' ? 'offline' : 'error' });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh(date);
    }, [refresh, date]),
  );

  const changeDay = (d: string) => {
    setLoad({ kind: 'loading' });
    setDate(d);
  };

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    setMessage(null);
    try {
      if (pending.action === 'cancel') await appointmentsApi.cancel(pending.a.id, t('doctor.cancelledByPhc'));
      else await appointmentsApi.setStatus(pending.a.id, pending.action);
      feedback.success(t(`doctor.done.${pending.action}`));
      setPending(null);
      await refresh(date);
    } catch (e) {
      const err = classifyError(e);
      setPending(null);
      setMessage(err.kind === 'offline' ? t('offlineBody') : t(`errors.${err.reason}`, { defaultValue: t('errors.generic') }));
      feedback.warn();
    } finally {
      setBusy(false);
    }
  };

  const loadedAt = load.kind === 'ready' ? load.at : 0;
  const started = (a: Appointment) => Date.parse(a.startsAt) <= loadedAt;
  const list = load.kind === 'ready' ? load.list : [];

  return (
    <Screen testID="screen-doctor-appointments" contentStyle={{ gap: theme.space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('actions.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} flipInRTL />
        <View style={{ flex: 1 }}>
          <Heading variant="h2">{t('doctor.title')}</Heading>
          <Text tone="secondary" variant="bodySmall">
            {role === 'admin' ? t('doctor.subtitleAdmin') : t('doctor.subtitleDoctor')}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
        <IconButton icon="chevron-back" accessibilityLabel={t('doctor.prev')} onPress={() => changeDay(addDays(date, -1))} flipInRTL testID="day-prev" />
        <View style={{ flex: 1, alignItems: 'center' }} accessible accessibilityLiveRegion="polite">
          <Text variant="title" align="center">
            {formatDay(date, language, true)}
          </Text>
          {date === today ? (
            <Text variant="caption" tone="secondary">
              {t('doctor.today')}
            </Text>
          ) : null}
        </View>
        <IconButton icon="chevron-forward" accessibilityLabel={t('doctor.next')} onPress={() => changeDay(addDays(date, 1))} flipInRTL testID="day-next" />
      </View>
      {date !== today ? <SecondaryButton label={t('doctor.today')} icon="today-outline" onPress={() => changeDay(today)} /> : null}

      {message ? (
        <Text tone="danger" accessibilityRole="alert">
          {message}
        </Text>
      ) : null}

      {load.kind === 'loading' ? (
        <Skeleton height={120} />
      ) : load.kind === 'offline' ? (
        <Notice icon="cloud-offline-outline" title={t('offlineTitle')} body={t('offlineListBody')}>
          <SecondaryButton label={t('actions.retry')} icon="refresh" onPress={() => void refresh(date)} />
        </Notice>
      ) : load.kind === 'error' ? (
        <ErrorState title={t('errorTitle')} body={t('errorBody')} retryLabel={t('actions.retry')} onRetry={() => void refresh(date)} />
      ) : !list.length ? (
        <EmptyState icon="calendar-outline" title={t('doctor.empty')} body={t('doctor.emptyBody')} testID="doctor-appointments-empty" />
      ) : (
        list.map((a) => (
          <AppointmentCard
            key={a.id}
            appointment={a}
            showPatient
            testID={`doctor-appointment-${a.id}`}
            actions={
              isActiveStatus(a.status) ? (
                <>
                  {a.status === 'booked' ? <SecondaryButton label={t('actions.confirm')} icon="checkmark" onPress={() => setPending({ a, action: 'confirm' })} testID={`confirm-${a.id}`} style={{ flexGrow: 1 }} /> : null}
                  <SecondaryButton label={t('actions.complete')} icon="checkmark-done" onPress={() => setPending({ a, action: 'complete' })} testID={`complete-${a.id}`} style={{ flexGrow: 1 }} />
                  {started(a) ? <SecondaryButton label={t('actions.noShow')} icon="person-remove-outline" onPress={() => setPending({ a, action: 'no-show' })} testID={`noshow-${a.id}`} style={{ flexGrow: 1 }} /> : null}
                  <SecondaryButton label={t('actions.cancel')} icon="close-circle-outline" onPress={() => setPending({ a, action: 'cancel' })} testID={`dcancel-${a.id}`} style={{ flexGrow: 1 }} />
                </>
              ) : undefined
            }
          />
        ))
      )}

      <PrimaryButton label={t('doctor.setHours')} icon="time-outline" onPress={() => router.push('/availability' as Href)} testID="open-availability" />

      <ConfirmDialog
        visible={!!pending}
        title={pending ? t(`doctor.dialog.${pending.action}.title`) : ''}
        body={pending ? t(`doctor.dialog.${pending.action}.body`, { patient: pending.a.patientName ?? t('patientFallback'), when: formatWhen(pending.a.startsAt, language) }) : undefined}
        confirmLabel={pending ? t(`doctor.dialog.${pending.action}.confirm`) : ''}
        cancelLabel={t('actions.goBack')}
        onConfirm={() => void run()}
        onCancel={() => setPending(null)}
        busy={busy}
        destructive={pending?.action === 'cancel' || pending?.action === 'no-show'}
        testID="doctor-dialog"
      />
    </Screen>
  );
}
