// Voice assistant: VoiceOrb -> record -> server STT -> chat (voice mode) -> server TTS, device voice on 503.
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { useAiChat } from '@/features/patient/chat/useAiChat';
import { EmergencyBanner } from '@/features/patient/chat/EmergencyBanner';
import { speak, stopSpeaking, type SpokenVia } from '@/features/patient/voice/speech';
import { useVoiceInput } from '@/features/patient/voice/useVoiceInput';
import { useSession } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Card, Heading, IconButton, Pill, Screen, Text, VoiceOrb, type VoiceOrbState } from '@/features/shared/ui';

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
  const startedAt = useRef(Date.now());
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
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
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

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const statusKey = orbState === 'listening' ? 'listening' : orbState === 'thinking' ? 'thinking' : orbState === 'speaking' ? 'speaking' : 'tapToSpeak';

  return (
    <Screen scroll={false} background="hero" testID="screen-voice-consultation">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="chevron-back" flipInRTL accessibilityLabel={t('chat.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1 }}>
          <Heading variant="h3">{t('voice.title')}</Heading>
          <Text variant="caption" tone="secondary" numeric>
            {`${mm}:${ss}`}
          </Text>
        </View>
        <IconButton icon="chatbubbles-outline" accessibilityLabel={t('voice.openChat')} onPress={() => router.replace('/assistant')} />
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space[4] }}>
        <VoiceOrb state={orbState} level={voice.level} onPress={() => void onOrb()} accessibilityLabel={t(`voice.${statusKey}`)} testID="voice-orb" />
        <Text variant="title" align="center" accessibilityLiveRegion="polite">
          {t(`voice.${statusKey}`)}
        </Text>
        {voice.state === 'recording' ? (
          <Text variant="caption" tone="secondary" numeric>
            {t('voice.seconds', { s: voice.seconds, max: voice.maxSeconds })}
          </Text>
        ) : null}
        {voice.error ? (
          <Pill label={t(`voice.error.${voice.error.kind}`)} tone="warning" icon="alert-circle-outline" />
        ) : null}
      </View>

      <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ gap: theme.space[3] }}>
        {chat.emergency ? <EmergencyBanner info={chat.emergency} onDismiss={chat.dismissEmergency} /> : null}
        {transcript !== null ? (
          <Card radius="xl" padding="md" tone="muted" testID="voice-transcript">
            <Text variant="caption" tone="tertiary">
              {t('voice.youSaid')}
            </Text>
            <Text>{transcript || t('voice.nothingHeard')}</Text>
          </Card>
        ) : null}
        {reply !== null || chat.status === 'streaming' ? (
          <Card radius="xl" padding="md" testID="voice-reply">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2], marginBottom: theme.space[1] }}>
              <Text variant="caption" tone="tertiary" style={{ flex: 1 }}>
                {t('voice.assistantSaid')}
              </Text>
              {demo ? <Pill label={t('chat.demoLabel')} tone="warning" icon="flask-outline" /> : null}
              {via === 'device' ? <Pill label={t('voice.deviceVoice')} tone="neutral" icon="phone-portrait-outline" /> : null}
            </View>
            <Text>{reply ?? chat.messages[chat.messages.length - 1]?.text ?? ''}</Text>
          </Card>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.space[4], paddingTop: theme.space[3] }}>
        <IconButton icon={speaking ? 'volume-mute' : 'volume-high'} accessibilityLabel={t('voice.stopSpeaking')} onPress={() => void stopSpeaking().then(() => setSpeaking(false))} />
        <IconButton icon="call" variant="dark" accessibilityLabel={t('voice.end')} onPress={() => void stopSpeaking().then(() => (router.canGoBack() ? router.back() : router.replace('/')))} testID="end-call" />
      </View>
    </Screen>
  );
}
