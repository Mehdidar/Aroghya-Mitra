import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { appointmentsApi, classifyError } from '@/features/appointments/api';
import { Chip, ConfirmDialog, Notice } from '@/features/appointments/components';
import { addDays, formatDay, istDateOf, weekdayName } from '@/features/appointments/format';
import { emptyForm, formFromRules, SLOT_LENGTHS, toInput, WEEK_ORDER, type Exception, type Form, type Window } from '@/features/appointments/availabilityForm';
import type { AvailabilityInput, AvailabilityResponse } from '@/features/appointments/types';
import { feedback } from '@/features/shared/feedback';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useSession } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Card, ErrorState, Heading, IconButton, PrimaryButton, Screen, SecondaryButton, Skeleton, Text, TextField } from '@/features/shared/ui';

/**
 * Doctor / admin: publish consultation hours. Patients can book only these
 * times. A doctor edits their own; an admin picks a doctor of the PHC.
 * Nothing is published until "Publish hours" is pressed.
 */
export default function AvailabilityScreen() {
  const { t } = useTranslation('appointments');
  const { language } = useLanguage();
  const theme = useTheme();
  const role = useSession((s) => s.role);
  const selfId = useSession((s) => s.currentUserId());
  const today = istDateOf(new Date());
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'offline' | 'error'>('loading');
  const [doctorId, setDoctorId] = useState<string | undefined>(role === 'doctor' ? selfId : undefined);
  const doctorIdRef = useRef<string | undefined>(role === 'doctor' ? selfId : undefined);
  const [form, setForm] = useState<Form>(emptyForm());
  const [pickingDate, setPickingDate] = useState(false);
  const [message, setMessage] = useState<{ tone: 'danger' | 'secondary'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const rulesOf = (res: AvailabilityResponse | null, id: string | undefined) => (res && id ? res.rules.filter((r) => r.doctorId === id) : []);

  // Applying the server's answer also resets the form to what is published.
  const apply = useCallback(
    (res: AvailabilityResponse | null, failure?: 'offline' | 'error') => {
      if (!res) {
        setState(failure ?? 'error');
        return;
      }
      const id = doctorIdRef.current ?? (role === 'admin' ? res.doctors[0]?.id : undefined);
      doctorIdRef.current = id;
      setData(res);
      setDoctorId(id);
      setForm(formFromRules(id ? res.rules.filter((r) => r.doctorId === id) : []));
      setState('ready');
    },
    [role],
  );
  const load = useCallback(
    () =>
      appointmentsApi.availability().then(
        (res) => apply(res),
        (e) => apply(null, classifyError(e).kind === 'offline' ? 'offline' : 'error'),
      ),
    [apply],
  );
  useEffect(() => {
    let alive = true;
    appointmentsApi.availability().then(
      (res) => alive && apply(res),
      (e) => alive && apply(null, classifyError(e).kind === 'offline' ? 'offline' : 'error'),
    );
    return () => {
      alive = false;
    };
  }, [apply]);
  const reload = () => {
    setState('loading');
    void load();
  };
  const selectDoctor = (id: string) => {
    doctorIdRef.current = id;
    setDoctorId(id);
    setForm(formFromRules(rulesOf(data, id)));
    setMessage(null);
  };

  const published = useMemo(() => rulesOf(data, doctorId), [data, doctorId]);

  const setWeekly = (wd: number, list: Window[]) => setForm((f) => ({ ...f, weekly: { ...f.weekly, [wd]: list } }));
  const setException = (i: number, patch: Partial<Exception>) => setForm((f) => ({ ...f, exceptions: f.exceptions.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));

  const publish = async (input: AvailabilityInput | null) => {
    if (!input) {
      setMessage({ tone: 'danger', text: t('availability.invalid') });
      feedback.warn(t('availability.invalid'));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await appointmentsApi.publish({ ...input, doctorId: role === 'admin' ? doctorId : undefined });
      const cleared = !input.weekly.length && !input.exceptions.length;
      const text = cleared ? t('availability.cleared') : t('availability.published');
      setMessage({ tone: 'secondary', text });
      feedback.success(text);
      setConfirmClear(false);
      await load();
    } catch (e) {
      const err = classifyError(e);
      setConfirmClear(false);
      setMessage({ tone: 'danger', text: err.kind === 'offline' ? t('availability.offline') : t(`errors.${err.reason}`, { defaultValue: t('errors.generic') }) });
    } finally {
      setBusy(false);
    }
  };

  const fillTemplate = () => {
    setForm((f) => ({ ...f, slotMinutes: 15, weekly: Object.fromEntries([1, 2, 3, 4, 5, 6].map((wd) => [wd, [{ start: '09:00', end: '13:00' }]])) }));
    setMessage({ tone: 'secondary', text: t('availability.templateFilled') });
  };

  const futureDates = useMemo(() => Array.from({ length: 60 }, (_, i) => addDays(today, i)).filter((d) => !form.exceptions.some((e) => e.date === d)), [today, form.exceptions]);
  const doctorName = data?.doctors.find((d) => d.id === doctorId)?.name;

  return (
    <Screen testID="screen-availability" contentStyle={{ gap: theme.space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('actions.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} flipInRTL />
        <View style={{ flex: 1 }}>
          <Heading variant="h2">{t('availability.title')}</Heading>
          <Text tone="secondary" variant="bodySmall">
            {t('availability.subtitle')}
          </Text>
        </View>
      </View>

      {state === 'loading' ? (
        <Skeleton height={160} />
      ) : state === 'offline' ? (
        <Notice icon="cloud-offline-outline" title={t('offlineTitle')} body={t('availability.offline')}>
          <SecondaryButton label={t('actions.retry')} icon="refresh" onPress={reload} />
        </Notice>
      ) : state === 'error' || !data ? (
        <ErrorState title={t('errorTitle')} body={t('errorBody')} retryLabel={t('actions.retry')} onRetry={reload} />
      ) : (
        <>
          {role === 'admin' ? (
            <View style={{ gap: theme.space[2] }}>
              <Text variant="label" accessibilityRole="header">
                {t('availability.doctor')}
              </Text>
              {data.doctors.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                  {data.doctors.map((d) => (
                    <Chip key={d.id} label={d.name} selected={d.id === doctorId} onPress={() => selectDoctor(d.id)} testID={`doctor-${d.id}`} />
                  ))}
                </View>
              ) : (
                <Text tone="secondary">{t('availability.noDoctors')}</Text>
              )}
            </View>
          ) : null}

          {doctorId ? (
            <>
              <Notice
                icon={published.length ? 'checkmark-circle-outline' : 'information-circle-outline'}
                title={published.length ? t('availability.current', { count: published.length }) : t('availability.nothingPublished')}
                body={[doctorName, data.facility.name].filter(Boolean).join(' · ')}
                tone="surface"
                testID="availability-status"
              />

              <Card tone="muted" radius="xl">
                <Text variant="label">{t('availability.templateTitle')}</Text>
                <Text variant="bodySmall" tone="secondary">
                  {t('availability.templateNote')}
                </Text>
                <SecondaryButton label={t('availability.template')} icon="color-wand-outline" onPress={fillTemplate} testID="availability-template" />
              </Card>

              <View style={{ gap: theme.space[2] }}>
                <Text variant="label" accessibilityRole="header">
                  {t('availability.slotLength')}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                  {SLOT_LENGTHS.map((m) => (
                    <Chip key={m} label={t('availability.minutes', { count: m })} selected={form.slotMinutes === m} onPress={() => setForm((f) => ({ ...f, slotMinutes: m }))} testID={`slot-length-${m}`} />
                  ))}
                </View>
              </View>

              <Text variant="h3" accessibilityRole="header">
                {t('availability.weekly')}
              </Text>
              {WEEK_ORDER.map((wd) => {
                const list = form.weekly[wd] ?? [];
                const day = weekdayName(wd, language);
                return (
                  <Card key={wd} radius="xl" testID={`weekday-${wd}`}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
                      <Text variant="title" style={{ flex: 1 }}>
                        {day}
                      </Text>
                      <Chip
                        label={list.length ? t('availability.open') : t('availability.closed')}
                        accessibilityLabel={`${day}: ${list.length ? t('availability.open') : t('availability.closed')}`}
                        selected={list.length > 0}
                        onPress={() => setWeekly(wd, list.length ? [] : [{ start: '09:00', end: '13:00' }])}
                        testID={`weekday-toggle-${wd}`}
                      />
                    </View>
                    {list.map((w, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space[2] }}>
                        <View style={{ flex: 1 }}>
                          <TextField label={t('availability.from')} value={w.start} onChangeText={(v) => setWeekly(wd, list.map((x, j) => (j === i ? { ...x, start: v } : x)))} numeric keyboardType="numbers-and-punctuation" accessibilityLabel={`${day} ${t('availability.from')}`} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <TextField label={t('availability.to')} value={w.end} onChangeText={(v) => setWeekly(wd, list.map((x, j) => (j === i ? { ...x, end: v } : x)))} numeric keyboardType="numbers-and-punctuation" accessibilityLabel={`${day} ${t('availability.to')}`} />
                        </View>
                        <IconButton icon="trash-outline" accessibilityLabel={t('availability.remove')} onPress={() => setWeekly(wd, list.filter((_, j) => j !== i))} />
                      </View>
                    ))}
                    {list.length ? <SecondaryButton label={t('availability.add')} icon="add" onPress={() => setWeekly(wd, [...list, { start: '14:00', end: '16:00' }])} /> : null}
                  </Card>
                );
              })}

              <Text variant="h3" accessibilityRole="header">
                {t('availability.exceptions')}
              </Text>
              <Text variant="bodySmall" tone="secondary">
                {t('availability.exceptionsNote')}
              </Text>
              {form.exceptions.map((e, i) => (
                <Card key={e.date} radius="xl" testID={`exception-${e.date}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
                    <Text variant="title" style={{ flex: 1 }}>
                      {formatDay(e.date, language, true)}
                    </Text>
                    <IconButton icon="trash-outline" accessibilityLabel={t('availability.removeDate')} onPress={() => setForm((f) => ({ ...f, exceptions: f.exceptions.filter((_, j) => j !== i) }))} />
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                    <Chip label={t('availability.dayOff')} selected={e.closed} onPress={() => setException(i, { closed: true })} />
                    <Chip label={t('availability.customHours')} selected={!e.closed} onPress={() => setException(i, { closed: false })} />
                  </View>
                  {!e.closed ? (
                    <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
                      <View style={{ flex: 1 }}>
                        <TextField label={t('availability.from')} value={e.start} onChangeText={(v) => setException(i, { start: v })} numeric keyboardType="numbers-and-punctuation" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextField label={t('availability.to')} value={e.end} onChangeText={(v) => setException(i, { end: v })} numeric keyboardType="numbers-and-punctuation" />
                      </View>
                    </View>
                  ) : null}
                </Card>
              ))}
              {pickingDate ? (
                <View style={{ gap: theme.space[2] }}>
                  <Text variant="label">{t('availability.pickDate')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space[2] }}>
                    {futureDates.map((d) => (
                      <Chip
                        key={d}
                        label={formatDay(d, language)}
                        accessibilityLabel={formatDay(d, language, true)}
                        selected={false}
                        onPress={() => {
                          setForm((f) => ({ ...f, exceptions: [...f.exceptions, { date: d, closed: true, start: '09:00', end: '13:00' }].sort((a, b) => a.date.localeCompare(b.date)) }));
                          setPickingDate(false);
                        }}
                        testID={`pick-${d}`}
                      />
                    ))}
                  </ScrollView>
                </View>
              ) : (
                <SecondaryButton label={t('availability.addException')} icon="calendar-outline" onPress={() => setPickingDate(true)} testID="availability-add-date" />
              )}

              {message ? (
                <Text tone={message.tone} accessibilityRole={message.tone === 'danger' ? 'alert' : undefined} testID="availability-message">
                  {message.text}
                </Text>
              ) : null}
              <PrimaryButton label={t('availability.publish')} icon="cloud-upload-outline" onPress={() => void publish(toInput(form, doctorId, today))} loading={busy && !confirmClear} testID="availability-publish" />
              {published.length ? <SecondaryButton label={t('availability.unpublish')} icon="trash-outline" onPress={() => setConfirmClear(true)} testID="availability-clear" /> : null}
              <Text variant="caption" tone="tertiary">
                {t('availability.timeZoneNote')}
              </Text>
            </>
          ) : null}

          <ConfirmDialog
            visible={confirmClear}
            title={t('availability.unpublishDialog.title')}
            body={t('availability.unpublishDialog.body')}
            confirmLabel={t('availability.unpublishDialog.confirm')}
            cancelLabel={t('actions.goBack')}
            onConfirm={() => void publish({ slotMinutes: form.slotMinutes, weekly: [], exceptions: [] })}
            onCancel={() => setConfirmClear(false)}
            busy={busy}
            destructive
          />
        </>
      )}
    </Screen>
  );
}
