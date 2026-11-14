import { toDbId } from '@am/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { markThreadRead, sendMessage, setRequestStatus } from '@/features/ashaConnect/api';
import type { AshaMessage } from '@/features/ashaConnect/types';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';
import { feedback } from '@/features/shared/feedback';

import { Button, Chip, ChipRow } from '../../../../features/asha/components/ui';
import { findPatient, isRequest, suggestedOffset, visitDayOptions } from '../../../../features/asha/connect/inbox';
import { Notice, dayLabel, formatWhen, urgentSigns, type T } from '../../../../features/asha/connect/ui';
import { markThreadReadLocal, upsertInboxMessage, useAshaInbox } from '../../../../features/asha/connect/useAshaInbox';
import { formatDate } from '../../../../features/asha/logic/clinical';
import { useAsha } from '../../../../features/asha/store/AshaContext';
import type { Lang } from '../../../../features/asha/types';
import { useTheme } from '../../../../features/shared/theme';
import { EmptyState, Icon, Pill, PrimaryButton, Text, TextField, type PillTone } from '../../../../features/shared/ui';

const STATUS_TONE: Record<string, PillTone> = { open: 'warning', accepted: 'info', done: 'success', declined: 'neutral' };
const ACTION_ERRORS = new Set(['closed', 'backwards', 'date_required', 'not_permitted', 'offline']);
const actionError = (reason: string, t: T) => t(ACTION_ERRORS.has(reason) ? `thread.err.${reason}` : 'thread.err.generic');

const call = (number: string) => void Linking.openURL(`tel:${number}`).catch(() => undefined);

export default function AshaThread() {
  const { patientId: rawParam } = useLocalSearchParams<{ patientId: string }>();
  const raw = decodeURIComponent(String(rawParam ?? ''));
  const { db, t, lang } = useAsha();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const inbox = useAshaInbox();
  const key = toDbId(raw);
  const thread = inbox.threads.find((th) => th.key === key);
  const patient = thread?.patient ?? findPatient(db.patients, raw);
  // Talk to the server with the id it uses for this patient (from its own messages) when known.
  const apiPatientId = thread?.patientId ?? raw;
  const messages = thread?.messages ?? [];

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  // Opening the thread reads it (also when new patient messages arrive while it is open).
  const unread = thread?.unread ?? 0;
  useEffect(() => {
    if (!inbox.available || !unread) return;
    markThreadReadLocal((m) => toDbId(m.patientId) === key);
    void markThreadRead(apiPatientId);
  }, [inbox.available, unread, key, apiPatientId]);

  const send = async (body: string) => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const r = await sendMessage({ patientId: apiPatientId, kind: 'text', body: text });
    setSending(false);
    if (r.ok) {
      upsertInboxMessage(r.message);
      setDraft('');
      feedback.success(t('thread.sent'));
    } else {
      setError(r.reason === 'offline' ? t('thread.sendFailed') : actionError(r.reason, t));
      feedback.warn(t('thread.sendFailed'));
    }
  };

  const name = patient?.name ?? t('msg.unknownPatient');
  const phone = patient?.phone;
  const quick = [t('thread.q.visitToday'), t('thread.q.comePhc'), t('thread.q.medicines'), ...(thread?.urgent ? [t('thread.q.call108')] : [])];

  if (!inbox.available) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.page, padding: theme.layout.screenPaddingX }} testID="screen-asha-thread">
        <Stack.Screen options={{ title: name }} />
        <ScreenGuide id="ashaThread" />
        <EmptyState icon="cloud-offline-outline" title={t('msg.noServer')} body={t('msg.noServerBody')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
      style={{ flex: 1, backgroundColor: theme.colors.page }}
      testID="screen-asha-thread"
    >
      <Stack.Screen options={{ title: name }} />
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
        contentContainerStyle={{ padding: theme.layout.screenPaddingX, gap: theme.space[3], maxWidth: theme.layout.maxContentWidth, width: '100%', alignSelf: 'center' }}
      >
        <ScreenGuide id="ashaThread" />

        {thread?.urgent ? (
          <Notice
            tone="danger"
            icon="warning"
            title={t('msg.urgent')}
            body={t('thread.urgentBanner', { signs: urgentSigns(thread.urgent, t) || t('msg.urgent') })}
            testID="thread-urgent"
          >
            {phone ? <Button title={t('thread.callPatient', { phone })} icon="call" variant="danger" onPress={() => call(phone)} testID="thread-call-urgent" /> : null}
            <Button title={t('thread.call108')} icon="medkit-outline" variant="secondary" onPress={() => call('108')} testID="thread-call-108" />
          </Notice>
        ) : null}

        {phone && !thread?.urgent ? (
          <Button title={t('thread.callPatient', { phone })} icon="call-outline" variant="secondary" onPress={() => call(phone)} testID="thread-call" />
        ) : null}
        {!phone ? (
          <Text variant="caption" tone="secondary">
            {t('thread.noPhone')}
          </Text>
        ) : null}

        {inbox.status === 'offline' ? <Notice tone="neutral" icon="cloud-offline-outline" title={t('msg.offline')} /> : null}

        {messages.length === 0 ? (
          <Text tone="secondary" align="center" style={{ paddingVertical: theme.space[6] }}>
            {t('thread.empty')}
          </Text>
        ) : (
          messages.map((m) => (isRequest(m) ? <RequestCard key={m.id} message={m} t={t} lang={lang} /> : <Bubble key={m.id} message={m} />))
        )}
      </ScrollView>

      <View
        style={{
          gap: theme.space[2],
          paddingHorizontal: theme.layout.screenPaddingX,
          paddingTop: theme.space[3],
          paddingBottom: insets.bottom + theme.space[3],
          borderTopWidth: 1,
          borderTopColor: theme.colors.divider,
          backgroundColor: theme.colors.page,
        }}
      >
        <Text variant="caption" tone="secondary">
          {t('thread.quick')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: theme.space[2] }}>
          {quick.map((q) => (
            <Chip key={q} label={q} tone={q === t('thread.q.call108') ? 'danger' : undefined} selected={draft === q} onPress={() => setDraft(q)} />
          ))}
        </ScrollView>
        {error ? (
          <Text variant="bodySmall" color={theme.colors.status.danger.fg} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        {/* Stacked, not side by side: at 150% text a send button beside the box would squeeze it. */}
        <TextField label={t('thread.replyLabel')} value={draft} onChangeText={setDraft} multiline maxLength={1000} testID="asha-reply-input" />
        <PrimaryButton label={t('thread.send')} icon="send" loading={sending} disabled={!draft.trim()} onPress={() => void send(draft)} testID="asha-reply-send" />
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message: m }: { message: AshaMessage }) {
  const theme = useTheme();
  const { t } = useAsha();
  const mine = m.from === 'asha';
  const urgent = !mine && m.urgent;
  const bg = mine ? theme.accent.accentSoft : urgent ? theme.colors.status.danger.bg : theme.colors.surface;
  const fg = urgent ? theme.colors.status.danger.fg : theme.colors.textPrimary;
  return (
    <View
      accessible
      accessibilityLabel={[mine ? t('msg.fromYou', { text: m.body }) : m.body, urgent ? t('msg.urgent') : null, formatWhen(m.createdAt)].filter(Boolean).join('. ')}
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '88%',
        gap: theme.space[1],
        paddingHorizontal: theme.space[4],
        paddingVertical: theme.space[3],
        borderRadius: theme.radii.lg,
        backgroundColor: bg,
        borderWidth: mine ? 0 : 1,
        borderColor: urgent ? theme.colors.status.danger.solid : theme.colors.border,
      }}
    >
      {urgent ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }}>
          <Icon name="warning" size={theme.sizes.icon.xs} color={theme.colors.status.danger.icon} />
          <Text variant="caption" weight="bold" color={fg}>
            {urgentSigns(m, t) ? t('msg.urgentReason', { signs: urgentSigns(m, t) }) : t('msg.urgent')}
          </Text>
        </View>
      ) : null}
      <Text variant="body" color={fg}>
        {m.body}
      </Text>
      <Text variant="caption" tone="tertiary">
        {formatWhen(m.createdAt)}
      </Text>
    </View>
  );
}

/** A visit or call request with the ASHA's answers. Status only moves forward (the server checks too). */
function RequestCard({ message: m, t, lang }: { message: AshaMessage; t: T; lang: Lang }) {
  const theme = useTheme();
  const [choosing, setChoosing] = useState(false);
  const options = useMemo(() => visitDayOptions(new Date()), [choosing]); // fresh "today" every time the chooser opens
  const [day, setDay] = useState(suggestedOffset(m.visitWhen));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visit = m.kind === 'visit_request';
  const status = m.status ?? 'open';

  const act = async (next: 'accepted' | 'done' | 'declined', scheduledFor?: string) => {
    if (busy) return;
    setBusy(next);
    setError(null);
    const r = await setRequestStatus(m.id, next, scheduledFor);
    setBusy(null);
    if (r.ok) {
      upsertInboxMessage(r.message);
      setChoosing(false);
      const note =
        next === 'accepted'
          ? visit
            ? t('thread.accepted', { date: formatDate(r.message.scheduledFor ?? scheduledFor ?? new Date().toISOString()) })
            : t('thread.acceptedCall')
          : next === 'done'
            ? t('thread.markedDone')
            : t('thread.declinedNote');
      feedback.success(note);
    } else {
      setError(actionError(r.reason, t));
      feedback.warn(actionError(r.reason, t));
    }
  };

  const title = t(`msg.kind.${m.kind}`);
  const when = m.visitWhen ? t('msg.asksFor', { when: t(`msg.when.${m.visitWhen}`) }) : null;
  return (
    <View
      testID={`request-${m.id}`}
      style={{
        gap: theme.space[3],
        padding: theme.layout.cardPadding,
        borderRadius: theme.radii.xl,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: m.urgent ? theme.colors.status.danger.solid : theme.colors.border,
        borderStartWidth: 4,
        borderStartColor: m.urgent ? theme.colors.status.danger.solid : theme.colors.status[STATUS_TONE[status] as 'warning'].solid,
      }}
    >
      <View accessible style={{ gap: theme.space[1] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2], flexWrap: 'wrap' }}>
          <Icon name={visit ? 'home-outline' : 'call-outline'} size={theme.sizes.icon.sm} color={theme.accent.accentIcon} />
          <Text variant="title" style={{ flexShrink: 1 }}>
            {title}
          </Text>
          <Pill label={t(`msg.status.${status}`)} tone={STATUS_TONE[status] ?? 'neutral'} />
        </View>
        {m.urgent ? (
          <Text variant="bodySmall" weight="semibold" color={theme.colors.status.danger.fg}>
            {urgentSigns(m, t) ? t('msg.urgentReason', { signs: urgentSigns(m, t) }) : t('msg.urgent')}
          </Text>
        ) : null}
        {when ? <Text variant="bodySmall">{when}</Text> : null}
        {m.body ? <Text variant="body">{m.body}</Text> : null}
        {m.scheduledFor && status === 'accepted' ? (
          <Text variant="bodySmall" weight="semibold" tone="accent">
            {t('msg.scheduledFor', { date: formatDate(m.scheduledFor) })}
          </Text>
        ) : null}
        <Text variant="caption" tone="tertiary">
          {formatWhen(m.createdAt)}
        </Text>
      </View>

      {status === 'open' && choosing && visit ? (
        <View style={{ gap: theme.space[2] }}>
          <Text variant="label">{t('thread.chooseDay')}</Text>
          <ChipRow>
            {options.map((o) => (
              <Chip key={o.offset} label={dayLabel(o.offset, o.date, lang, t)} selected={day === o.offset} onPress={() => setDay(o.offset)} />
            ))}
          </ChipRow>
          <Button
            title={t('thread.confirmVisit')}
            icon="checkmark-circle"
            loading={busy === 'accepted'}
            onPress={() => void act('accepted', options.find((o) => o.offset === day)?.iso)}
            testID={`request-confirm-${m.id}`}
          />
          <Button title={t('common.cancel')} variant="secondary" onPress={() => setChoosing(false)} />
        </View>
      ) : status === 'open' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          <Button
            title={t('thread.accept')}
            icon="checkmark"
            loading={busy === 'accepted'}
            onPress={() => (visit ? setChoosing(true) : void act('accepted'))}
            style={{ flexGrow: 1 }}
            testID={`request-accept-${m.id}`}
          />
          <Button
            title={t('thread.decline')}
            icon="close"
            variant="secondary"
            loading={busy === 'declined'}
            onPress={() => void act('declined')}
            style={{ flexGrow: 1 }}
            testID={`request-decline-${m.id}`}
          />
        </View>
      ) : status === 'accepted' ? (
        <Button title={t('thread.done')} icon="checkmark-done" loading={busy === 'done'} onPress={() => void act('done')} testID={`request-done-${m.id}`} />
      ) : null}

      {error ? (
        <Text variant="bodySmall" color={theme.colors.status.danger.fg} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
