/**
 * Pieces of the patient's "My ASHA" screen: the ASHA card, one message or
 * request in the thread, quick chips, and the "Please visit me" chooser.
 * Only real data is shown: no phone button without a phone number, no visit
 * date the ASHA did not give.
 */
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, Pressable, ScrollView, View } from 'react-native';

import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';
import { Avatar, Card, Heading, Icon, Pill, PrimaryButton, SecondaryButton, Text, TextField, type IconName, type PillTone } from '@/features/shared/ui';

import type { AshaCard, AshaMessage, VisitWhen } from '../types';
import { firstName, formatPastDate, formatStamp, formatVisitDay } from './format';

export const VISIT_WHEN: VisitWhen[] = ['today', 'tomorrow', 'this_week'];

/** A failure reason from the server, in words. */
export function reasonText(t: TFunction, reason: string): string {
  switch (reason) {
    case 'offline':
      return t('ashaConnect:state.offline');
    case 'no_patient':
      return t('ashaConnect:state.noPatient');
    case 'no_asha':
      return t('ashaConnect:state.noAsha');
    case 'area_required':
      return t('ashaConnect:state.areaRequired');
    case 'empty':
      return t('ashaConnect:state.empty');
    case 'when_required':
      return t('ashaConnect:visit.chooseWhen');
    case 'inactive_account':
      return t('ashaConnect:state.inactive');
    default:
      return t('ashaConnect:state.error');
  }
}

const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** Who my ASHA is: name, villages, last visit, and Call (only with a real number). */
export function AshaCardView({ asha }: { asha: AshaCard }) {
  const { t } = useTranslation('ashaConnect');
  const { language } = useLanguage();
  const theme = useTheme();
  return (
    <Card radius="xl" padding="lg" testID="my-asha-card">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <Avatar name={asha.fullName} size="lg" />
        <View style={{ flex: 1, gap: theme.space[1] }}>
          <Heading variant="h3">{asha.fullName}</Heading>
          <Text variant="bodySmall" tone="secondary">
            {t('card.role')}
          </Text>
        </View>
      </View>
      <View style={{ gap: theme.space[2] }}>
        <InfoRow icon="location-outline" text={asha.areas.length ? t('card.covers', { areas: asha.areas.join(', ') }) : t('card.noAreas')} />
        <InfoRow icon="home-outline" text={asha.lastVisitAt ? t('card.lastVisit', { date: formatPastDate(asha.lastVisitAt, language) }) : t('card.noVisit')} />
      </View>
      {asha.phone ? (
        <PrimaryButton
          label={t('card.call', { name: firstName(asha.fullName) })}
          icon="call"
          onPress={() => void Linking.openURL(telUrl(asha.phone!))}
          accessibilityHint={asha.phone}
          testID="my-asha-call"
        />
      ) : (
        <Text variant="caption" tone="tertiary">
          {t('card.noPhone')}
        </Text>
      )}
    </Card>
  );
}

function InfoRow({ icon, text }: { icon: IconName; text: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space[2] }}>
      <Icon name={icon} size={theme.sizes.icon.sm} color={theme.colors.textSecondary} />
      <Text variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/** Status of a visit / call-back request in words, with a tone and icon (colour is never the only signal). */
export function requestStatus(t: TFunction, m: AshaMessage, ashaName: string, language: Parameters<typeof formatVisitDay>[1]): { label: string; tone: PillTone; icon: IconName } {
  const name = firstName(ashaName);
  switch (m.status) {
    case 'accepted':
      if (m.kind === 'call_request') return { label: t('ashaConnect:request.callAccepted', { name }), tone: 'success', icon: 'checkmark-circle' };
      return m.scheduledFor
        ? { label: t('ashaConnect:request.visitAccepted', { name, date: formatVisitDay(m.scheduledFor, language) }), tone: 'success', icon: 'calendar' }
        : { label: t('ashaConnect:request.visitAcceptedNoDate', { name }), tone: 'success', icon: 'checkmark-circle' };
    case 'done':
      return { label: t('ashaConnect:request.done'), tone: 'neutral', icon: 'checkmark-done' };
    case 'declined':
      return { label: t('ashaConnect:request.declined'), tone: 'warning', icon: 'close-circle' };
    default:
      return { label: t('ashaConnect:request.open', { name }), tone: 'info', icon: 'time-outline' };
  }
}

/** One row of the thread: a text bubble, or a request card with its status. */
export function MessageItem({ m, ashaName }: { m: AshaMessage; ashaName: string }) {
  const { t } = useTranslation('ashaConnect');
  const { language } = useLanguage();
  const theme = useTheme();
  const mine = m.from === 'patient';
  const who = mine ? t('thread.you') : ashaName;
  const stamp = formatStamp(m.createdAt, language);

  if (m.kind !== 'text') {
    const st = requestStatus(t, m, ashaName, language);
    const title = m.kind === 'visit_request' ? t('request.visitTitle') : t('request.callTitle');
    return (
      <Card tone="muted" radius="xl" testID={`my-asha-request-${m.id}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
          <Icon name={m.kind === 'visit_request' ? 'home' : 'call'} size={theme.sizes.icon.sm} color={theme.accent.accentIcon} />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {title}
          </Text>
        </View>
        {m.visitWhen && m.kind === 'visit_request' ? (
          <Text variant="bodySmall" tone="secondary">
            {t('request.asked', { when: t(`request.when.${m.visitWhen}`) })}
          </Text>
        ) : null}
        {m.body ? <Text variant="body">{m.body}</Text> : null}
        <Pill label={st.label} tone={st.tone} icon={st.icon} />
        <Text variant="caption" tone="tertiary">
          {`${who} · ${stamp}`}
        </Text>
      </Card>
    );
  }

  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: theme.space[1] }} testID={mine ? 'my-asha-msg-mine' : 'my-asha-msg-asha'}>
      <View
        accessible
        accessibilityLabel={`${who}: ${m.body}. ${stamp}`}
        style={{
          maxWidth: '88%',
          padding: theme.space[3],
          borderRadius: theme.radii.xl,
          borderBottomEndRadius: mine ? theme.radii.xs : theme.radii.xl,
          borderBottomStartRadius: mine ? theme.radii.xl : theme.radii.xs,
          backgroundColor: mine ? theme.accent.accent : theme.colors.surface,
          boxShadow: mine ? undefined : theme.shadows.card.boxShadow,
        }}>
        <Text variant="body" color={mine ? theme.colors.textOnAccent : undefined}>
          {m.body}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2], flexWrap: 'wrap' }}>
        {m.urgent ? <Pill label={t('thread.urgent')} tone="danger" icon="warning" /> : null}
        <Text variant="caption" tone="tertiary">
          {`${who} · ${stamp}`}
        </Text>
      </View>
    </View>
  );
}

/** A pale rounded button: a quick message or a choice. */
export function Chip({ label, onPress, selected, disabled, testID }: { label: string; onPress: () => void; selected?: boolean; disabled?: boolean; testID?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={{
        minHeight: theme.sizes.touchMin,
        paddingHorizontal: theme.space[4],
        paddingVertical: theme.space[2],
        borderRadius: theme.radii.full,
        backgroundColor: selected ? theme.accent.accent : theme.accent.accentSoft,
        borderWidth: selected ? 2 : 0,
        borderColor: theme.accent.accentText,
        justifyContent: 'center',
        opacity: disabled ? 0.6 : 1,
      }}>
      <Text variant="label" color={selected ? theme.colors.textOnAccent : theme.accent.accentSoftText}>
        {label}
      </Text>
    </Pressable>
  );
}

/** "Please visit me": when (required) and an optional reason. */
export function VisitSheet({ visible, ashaName, busy, onSend, onCancel }: { visible: boolean; ashaName: string; busy?: boolean; onSend: (when: VisitWhen, reason: string) => void; onCancel: () => void }) {
  const { t } = useTranslation('ashaConnect');
  const theme = useTheme();
  const [when, setWhen] = useState<VisitWhen | null>(null);
  const [reason, setReason] = useState('');
  const close = () => {
    setWhen(null);
    setReason('');
    onCancel();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.space[5], backgroundColor: theme.colors.scrim }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <View testID="my-asha-visit-sheet" accessibilityViewIsModal style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl, padding: theme.space[5], gap: theme.space[4], maxWidth: 480, width: '100%', alignSelf: 'center' }}>
            <Heading variant="h3" accessibilityRole="header">
              {t('visit.title', { name: firstName(ashaName) })}
            </Heading>
            <Text variant="label" tone="secondary">
              {t('visit.whenLabel')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }} accessibilityRole="radiogroup">
              {VISIT_WHEN.map((w) => (
                <Chip key={w} label={t(`request.when.${w}`)} selected={when === w} onPress={() => setWhen(w)} testID={`my-asha-visit-${w}`} />
              ))}
            </View>
            <TextField label={t('visit.reasonLabel')} placeholder={t('visit.reasonPlaceholder')} value={reason} onChangeText={setReason} multiline maxLength={500} testID="my-asha-visit-reason" />
            <PrimaryButton
              label={t('visit.send')}
              icon="send"
              disabled={!when}
              loading={busy}
              accessibilityHint={when ? undefined : t('visit.chooseWhen')}
              onPress={() => {
                if (!when) return;
                onSend(when, reason);
                setWhen(null);
                setReason('');
              }}
              testID="my-asha-visit-send"
            />
            <SecondaryButton label={t('visit.cancel')} onPress={close} disabled={busy} testID="my-asha-visit-cancel" />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/** A short notice (offline, waiting, sent). */
export function Notice({ icon, tone, title, body, testID }: { icon: IconName; tone: 'info' | 'warning' | 'success' | 'danger'; title: string; body?: string; testID?: string }) {
  const theme = useTheme();
  const s = theme.colors.status[tone];
  return (
    <View
      testID={testID}
      accessible
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'flex-start', backgroundColor: s.bg, borderRadius: theme.radii.xl, padding: theme.space[4] }}>
      <Icon name={icon} size={theme.sizes.icon.md} color={s.icon} />
      <View style={{ flex: 1, gap: theme.space[1] }}>
        <Text variant="bodyStrong" color={s.fg}>
          {title}
        </Text>
        {body ? (
          <Text variant="bodySmall" color={s.fg}>
            {body}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
