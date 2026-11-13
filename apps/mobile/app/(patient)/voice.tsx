// Voice assistant, styled like a call: one big glowing panel with live captions, the orb at the bottom,
// and a call bar (stop voice · end · type instead). Record -> server STT -> chat (voice mode) -> server TTS,
// device voice on 503.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { EmergencyBanner } from '@/features/patient/chat/EmergencyBanner';
import { useAiChat } from '@/features/patient/chat/useAiChat';
import { PANEL, VoicePanel } from '@/features/patient/voice/VoicePanel';
import { speak, stopSpeaking, type SpokenVia } from '@/features/patient/voice/speech';
import { useVoiceInput } from '@/features/patient/voice/useVoiceInput';
import { useSession } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Icon, IconButton, Pill, Screen, Text, VoiceOrb, type VoiceOrbState, type IconName } from '@/features/shared/ui';

const SAMPLES = ['fever', 'bp'] as const;

/** One round button in the call bar. */
function CallButton({ icon, label, onPress, tone = 'soft', testID, rotate }: { icon: IconName; label: string; onPress: () => void; tone?: 'soft' | 'end'; testID?: string; rotate?: string }) {
  const t = useTheme();
  const end = tone === 'end';
  const size = end ? 76 : 60;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      hitSlop={8}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
        backgroundColor: end ? '#F2553D' : t.colors.surfaceMuted,
        backgroundImage: end && !t.highContrast ? 'linear-gradient(160deg, #FF8A5B 0%, #F2553D 55%, #E23B35 100%)' : undefined,
        boxShadow: end ? '0px 10px 24px -6px rgba(226, 59, 53, 0.55)' : undefined,
      })}>
      <View style={rotate ? { transform: [{ rotate }] } : undefined}>
        <Icon name={icon} size={end ? 32 : 24} color={end ? '#FFFFFF' : t.colors.textSecondary} />
      </View>
    </Pressable>
  );
}

export default function VoiceConsultation() {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const language = useSession((s) => s.language);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [via, setVia] = useState<SpokenVia | null>(null);
  const [demo, setDemo] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const voice = useVoiceInput(language);
  const chat = useAiChat({
    persist: false,
    mode: 'voice',
    demoText: (key) => t(`chat.demo.${key}`),
    onReply: (m) => {
      setReply(m.text);
      setDemo(!!m.demo);
      setSpeaking(true);
      void speak(m.text, language, { onDone: () => setSpeaking(false) }).then(setVia);
    },
  });

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => {
      clearInterval(id);
      void stopSpeaking();
    };
  }, []);

  const orbState: VoiceOrbState = voice.state === 'recording' ? 'listening' : voice.state === 'transcribing' || chat.status === 'streaming' ? 'thinking' : speaking ? 'speaking' : 'idle';

  const onOrb = useCallback(async () => {
    if (speaking) {
      await stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (voice.state === 'recording') return void voice.stop();
    if (orbState !== 'idle') return;
    setReply(null);
    await voice.start((tr) => {
      setTranscript(tr.text);
      if (tr.text) void chat.send(tr.text);
    });
  }, [chat, orbState, speaking, voice]);

  const ask = (text: string) => {
    setReply(null);
    setTranscript(text);
    void chat.send(text);
  };
  const end = () => void stopSpeaking().then(() => (router.canGoBack() ? router.back() : router.replace('/')));

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const statusKey = orbState === 'listening' ? 'listening' : orbState === 'thinking' ? 'thinking' : orbState === 'speaking' ? 'speaking' : 'tapToSpeak';
  const streamed = chat.status === 'streaming' ? chat.messages[chat.messages.length - 1]?.text : null;
  const answer = reply ?? streamed ?? null;
  // The big caption: the answer while it is spoken, otherwise what you said, otherwise what to do.
  const caption = answer || (transcript !== null ? (transcript ? `“${transcript}”` : t('voice.nothingHeard')) : t(`voice.${statusKey}`));
  const fresh = transcript === null && answer === null && orbState === 'idle';

  return (
    <Screen scroll={false} background="page" testID="screen-voice-consultation" contentStyle={{ gap: theme.space[4] }}>
      <VoicePanel style={{ flex: 1 }} testID="voice-panel">
        <View style={{ flex: 1, paddingHorizontal: theme.space[5], paddingTop: theme.space[4], paddingBottom: theme.space[2] }}>
          {/* Header: back · title and call timer · nothing (keeps the title centred) */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconButton icon="chevron-back" variant="glass" flipInRTL accessibilityLabel={t('chat.back')} onPress={end} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="bodyStrong" color={PANEL.header}>
                {t('voice.title')}
              </Text>
              <Text variant="caption" color={PANEL.header} numeric>
                {`${mm}:${ss}`}
              </Text>
            </View>
            <View style={{ width: 44 }} />
          </View>

          {chat.emergency ? (
            <View style={{ marginTop: theme.space[3] }}>
              <EmergencyBanner info={chat.emergency} onDismiss={chat.dismissEmergency} />
            </View>
          ) : null}

          {/* Live caption */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: theme.space[4], gap: theme.space[3] }} showsVerticalScrollIndicator={false}>
            {answer && transcript ? (
              <Text variant="bodySmall" align="center" color={PANEL.textSoft} numberOfLines={2} testID="voice-transcript">
                {`${t('voice.youSaid')}: “${transcript}”`}
              </Text>
            ) : null}
            <Text
              align="center"
              color={PANEL.text}
              accessibilityLiveRegion="polite"
              testID={answer ? 'voice-reply' : 'voice-caption'}
              style={{ fontSize: answer && answer.length > 160 ? 20 : 26, lineHeight: answer && answer.length > 160 ? 28 : 34, fontWeight: '600', textShadowColor: 'rgba(14, 46, 134, 0.35)', textShadowRadius: 12 }}>
              {caption}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: theme.space[2] }}>
              {answer ? null : orbState !== 'idle' ? (
                <Text variant="caption" color={PANEL.textSoft}>
                  {orbState === 'listening' ? t('voice.seconds', { s: voice.seconds, max: voice.maxSeconds }) : t(`voice.${statusKey}`)}
                </Text>
              ) : null}
              {demo ? <Pill label={t('chat.demoLabel')} tone="warning" icon="flask-outline" /> : null}
              {via === 'device' ? <Pill label={t('voice.deviceVoice')} tone="neutral" icon="phone-portrait-outline" /> : null}
              {voice.error ? <Pill label={t(`voice.error.${voice.error.kind}`, voice.error.message)} tone="warning" icon="alert-circle-outline" /> : null}
            </View>
            {fresh ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.space[2], marginTop: theme.space[2] }}>
                {SAMPLES.map((k) => (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    onPress={() => ask(t(`voice.samples.${k}`))}
                    testID={`voice-sample-${k}`}
                    style={({ pressed }) => ({ maxWidth: '100%', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 24, backgroundColor: PANEL.chip, borderWidth: 1, borderColor: PANEL.chipBorder, opacity: pressed ? 0.75 : 1 })}>
                    <Text variant="bodySmall" weight="semibold" align="center" color={PANEL.text}>
                      {`“${t(`voice.samples.${k}`)}”`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>

          {/* The orb */}
          <View style={{ alignItems: 'center' }}>
            <VoiceOrb state={orbState} level={voice.level} size={128} onPress={() => void onOrb()} accessibilityLabel={t(`voice.${statusKey}`)} testID="voice-orb" />
          </View>
        </View>
      </VoicePanel>

      {/* Call bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          alignSelf: 'center',
          width: '100%',
          maxWidth: 420,
          paddingVertical: theme.space[2],
          paddingHorizontal: theme.space[4],
          borderRadius: 999,
          backgroundColor: theme.colors.surface,
          boxShadow: '0px 8px 28px -10px rgba(15, 40, 90, 0.25)',
        }}>
        <CallButton icon={speaking ? 'volume-mute' : 'volume-high-outline'} label={t('voice.stopSpeaking')} onPress={() => void stopSpeaking().then(() => setSpeaking(false))} testID="voice-stop-speaking" />
        <CallButton icon="call" tone="end" rotate="135deg" label={t('voice.end')} onPress={end} testID="end-call" />
        <CallButton icon="keypad" label={t('voice.openChat')} onPress={() => router.replace('/assistant')} testID="voice-open-chat" />
      </View>
    </Screen>
  );
}
