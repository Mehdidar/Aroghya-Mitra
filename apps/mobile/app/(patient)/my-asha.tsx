// "My ASHA": the patient's village health worker. If one is assigned: her card
// (call only when a real number is on file), the message thread with her, and
// one-tap "Please visit me" / "Please call me back" requests. If not: type your
// village to find her (assigned at once when an ASHA covers it, else the PHC
// admin assigns one). Messages are a communication aid, not an emergency line:
// emergency signs show the 108 banner at once, and the floating 108 button
// (patient layout) stays on this screen.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { DEMO_FACILITY } from '@am/shared';

import { AshaCardView, Chip, MessageItem, Notice, VisitSheet, reasonText } from '@/features/ashaConnect/patient/components';
import { firstName, formatPastDate } from '@/features/ashaConnect/patient/format';
import { useMyAsha, type FindResult } from '@/features/ashaConnect/patient/useMyAsha';
import type { MyAsha } from '@/features/ashaConnect/api';
import type { AshaCard, VisitWhen } from '@/features/ashaConnect/types';
import { EmergencyBanner } from '@/features/patient/chat/EmergencyBanner';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';
import { feedback } from '@/features/shared/feedback';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';
import { Card, Heading, Icon, IconButton, PrimaryButton, Screen, SecondaryButton, SectionHeader, Skeleton, Text, TextField } from '@/features/shared/ui';

const QUICK = ['medicines', 'newProblem', 'nextVisit'] as const;
const SHOW_LAST = 20;

type Flash = { tone: 'success' | 'danger'; text: string } | null;

export default function MyAshaScreen() {
  const { t } = useTranslation('ashaConnect');
  const theme = useTheme();
  const s = useMyAsha();
  const [found, setFound] = useState<string | null>(null);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen testID="screen-my-asha" contentStyle={{ gap: theme.space[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
          <IconButton icon="arrow-back" flipInRTL accessibilityLabel={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <Heading variant="h2" style={{ flex: 1 }}>
            {t('title')}
          </Heading>
        </View>
        <ScreenGuide id="myAsha" />
        <Text variant="bodySmall" tone="secondary">
          {t('subtitle')}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space[2] }} testID="my-asha-emergency-note">
          <Icon name="warning-outline" size={theme.sizes.icon.sm} color={theme.colors.status.danger.icon} />
          <Text variant="bodySmall" weight="semibold" color={theme.colors.status.danger.fg} style={{ flex: 1 }}>
            {t('emergencyNote')}
          </Text>
        </View>

        {s.emergency ? <EmergencyBanner info={s.emergency} onDismiss={s.dismissEmergency} /> : null}

        {s.offline ? <Notice icon="cloud-offline-outline" tone="warning" title={s.mine ? t('state.offlineSaved') : t('state.offline')} testID="my-asha-offline" /> : null}

        {s.loading ? (
          <View style={{ gap: theme.space[3] }} testID="my-asha-loading">
            <Skeleton height={140} radius={theme.radii.xl} />
            <Skeleton height={60} radius={theme.radii.xl} />
          </View>
        ) : !s.mine ? (
          <View style={{ gap: theme.space[3] }}>
            {s.error ? <Notice icon="alert-circle" tone="danger" title={reasonText(t, s.error)} testID="my-asha-error" /> : null}
            <SecondaryButton label={t('actions.retry')} icon="refresh" onPress={() => void s.reload()} testID="my-asha-retry" />
          </View>
        ) : s.mine.asha ? (
          <>
            {found ? <Notice icon="checkmark-circle" tone="success" title={found} testID="my-asha-found" /> : null}
            <Assigned asha={s.mine.asha} state={s} />
          </>
        ) : (
          <FindForm
            mine={s.mine}
            busy={s.busy}
            onFind={s.find}
            onFound={setFound}
          />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Assigned({ asha, state: s }: { asha: AshaCard; state: ReturnType<typeof useMyAsha> }) {
  const { t } = useTranslation('ashaConnect');
  const theme = useTheme();
  const [input, setInput] = useState('');
  const [visitOpen, setVisitOpen] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [showAll, setShowAll] = useState(false);
  const name = firstName(asha.fullName);

  const send = async (kind: 'text' | 'visit_request' | 'call_request', body: string, when?: VisitWhen) => {
    if (kind === 'text' && !body.trim()) return;
    setFlash(null);
    const r = await s.send(kind, body, when);
    if (r.ok) {
      const done = kind === 'visit_request' ? t('sent.visit', { name }) : kind === 'call_request' ? t('sent.callback', { name }) : t('sent.message', { name });
      if (kind === 'text') setInput('');
      else setFlash({ tone: 'success', text: done });
      if (kind === 'visit_request') setVisitOpen(false);
      feedback.success(done);
    } else {
      const why = t('state.notSent', { reason: reasonText(t, r.reason) });
      setFlash({ tone: 'danger', text: why });
      if (kind === 'visit_request') setVisitOpen(false);
      feedback.warn(why);
    }
  };

  const shown = showAll ? s.messages : s.messages.slice(-SHOW_LAST);

  return (
    <>
      <AshaCardView asha={asha} />

      <View style={{ gap: theme.space[3] }}>
        <SecondaryButton label={t('actions.visit')} icon="home-outline" onPress={() => setVisitOpen(true)} disabled={s.busy} testID="my-asha-visit" />
        <SecondaryButton label={t('actions.callback')} icon="call-outline" onPress={() => void send('call_request', '')} disabled={s.busy} testID="my-asha-callback" />
      </View>

      {flash ? <Notice icon={flash.tone === 'success' ? 'checkmark-circle' : 'alert-circle'} tone={flash.tone} title={flash.text} testID="my-asha-flash" /> : null}

      <SectionHeader title={t('thread.title')} />
      {s.messages.length > shown.length ? (
        <Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={{ minHeight: theme.sizes.touchMin, justifyContent: 'center', alignSelf: 'center', paddingHorizontal: theme.space[3] }} testID="my-asha-earlier">
          <Text variant="label" color={theme.accent.accentText}>
            {t('actions.showEarlier')}
          </Text>
        </Pressable>
      ) : null}
      {shown.length ? (
        <View style={{ gap: theme.space[3] }} testID="my-asha-thread">
          {shown.map((m) => (
            <MessageItem key={m.id} m={m} ashaName={asha.fullName} />
          ))}
        </View>
      ) : (
        <Card tone="muted" radius="xl" testID="my-asha-thread-empty">
          <Text variant="bodySmall" tone="secondary">
            {t('thread.empty')}
          </Text>
        </Card>
      )}

      <View style={{ gap: theme.space[2] }}>
        <Text variant="label" tone="secondary">
          {t('quick.title')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {QUICK.map((k) => (
            <Chip key={k} label={t(`quick.${k}`)} onPress={() => void send('text', t(`quick.${k}`))} disabled={s.busy} testID={`my-asha-quick-${k}`} />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space[2] }}>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('composer.label')}
            placeholder={t('composer.placeholder', { name })}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => void send('text', input)}
            returnKeyType="send"
            multiline
            maxLength={1000}
            testID="my-asha-input"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('actions.sendA11y', { name })}
          accessibilityState={{ disabled: !input.trim() || s.busy, busy: s.busy }}
          onPress={() => void send('text', input)}
          disabled={!input.trim() || s.busy}
          testID="my-asha-send"
          style={{ width: 56, height: 56, borderRadius: theme.radii.full, backgroundColor: input.trim() ? theme.accent.accent : theme.colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
          <Icon name="send" size={theme.sizes.icon.md} color={input.trim() ? theme.colors.textOnAccent : theme.colors.textTertiary} flipInRTL />
        </Pressable>
      </View>

      <VisitSheet visible={visitOpen} ashaName={asha.fullName} busy={s.busy} onCancel={() => setVisitOpen(false)} onSend={(when, reason) => void send('visit_request', reason, when)} />
    </>
  );
}

function FindForm({ mine, busy, onFind, onFound }: { mine: MyAsha; busy: boolean; onFind: (area: string) => Promise<FindResult>; onFound: (text: string | null) => void }) {
  const { t } = useTranslation('ashaConnect');
  const { language } = useLanguage();
  const theme = useTheme();
  const [area, setArea] = useState(mine.area ?? '');
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // The saved village arrives after the first render: prefill once, never over what the patient typed.
  useEffect(() => {
    if (mine.area) setArea((cur) => cur || mine.area || '');
  }, [mine.area]);

  const submit = async () => {
    setError(null);
    setFailed(null);
    if (!area.trim()) {
      setError(t('state.areaRequired'));
      return;
    }
    const r = await onFind(area);
    if (!r.ok) {
      if (r.reason === 'area_required') setError(t('state.areaRequired'));
      else setFailed(reasonText(t, r.reason));
      feedback.warn(reasonText(t, r.reason));
      return;
    }
    // The parent re-renders with the new state; announce the result.
    if (r.mine.asha) {
      const text = t('find.found', { name: r.mine.asha.fullName });
      onFound(text);
      feedback.success(text);
    } else {
      feedback.success(t('find.waitingTitle', { phc: DEMO_FACILITY.name }));
    }
  };

  return (
    <View style={{ gap: theme.space[4] }}>
      {mine.waitingSince ? (
        <Card tone="muted" radius="xl" testID="my-asha-waiting">
          <View style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'flex-start' }} accessible accessibilityLiveRegion="polite">
            <Icon name="hourglass-outline" size={theme.sizes.icon.md} color={theme.colors.status.info.icon} />
            <View style={{ flex: 1, gap: theme.space[1] }}>
              <Text variant="bodyStrong">{t('find.waitingTitle', { phc: DEMO_FACILITY.name })}</Text>
              <Text variant="bodySmall" tone="secondary">
                {t('find.waitingBody', { area: mine.area ?? area })}
              </Text>
              <Text variant="caption" tone="tertiary">
                {t('find.waitingSince', { date: formatPastDate(mine.waitingSince, language) })}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      <Card radius="xl" padding="lg" testID="my-asha-find">
        <Heading variant="h3">{mine.waitingSince ? t('find.changeArea') : t('find.title')}</Heading>
        {mine.waitingSince ? null : (
          <Text variant="bodySmall" tone="secondary">
            {t('find.body')}
          </Text>
        )}
        <TextField
          label={t('find.label')}
          placeholder={t('find.placeholder')}
          value={area}
          onChangeText={(v) => {
            setArea(v);
            if (error) setError(null);
          }}
          onSubmitEditing={() => void submit()}
          returnKeyType="search"
          autoCapitalize="words"
          maxLength={80}
          error={error ?? undefined}
          testID="my-asha-find-input"
        />
        {failed ? <Notice icon="alert-circle" tone="danger" title={failed} testID="my-asha-find-failed" /> : null}
        <PrimaryButton label={mine.waitingSince ? t('find.update') : t('find.submit')} icon="search" loading={busy} onPress={() => void submit()} testID="my-asha-find-submit" />
      </Card>
    </View>
  );
}
