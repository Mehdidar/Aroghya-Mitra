// AI health chat: streams from the server's /ai/chat (Sarvam chatbot with approved-content RAG and
// red-flag checks). Red flags are also checked on the phone before sending, so "Call 108" is instant.
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { useAiChat } from '@/features/patient/chat/useAiChat';
import { DEMO_CHIP_KEYS } from '@/features/patient/chat/demoReplies';
import { EmergencyBanner } from '@/features/patient/chat/EmergencyBanner';
import type { ChatMessage } from '@/features/patient/chat/types';
import { useTheme } from '@/features/shared/theme';
import { Avatar, Card, Heading, Icon, IconButton, Pill, Screen, Skeleton, Text, TextField } from '@/features/shared/ui';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';

function Bubble({ m }: { m: ChatMessage }) {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const mine = m.role === 'user';
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: theme.space[1] }} testID={`msg-${m.role}`}>
      <View
        style={{
          maxWidth: '88%',
          padding: theme.space[3],
          borderRadius: theme.radii.xl,
          borderBottomEndRadius: mine ? theme.radii.xs : theme.radii.xl,
          borderBottomStartRadius: mine ? theme.radii.xl : theme.radii.xs,
          backgroundColor: mine ? theme.accent.accent : theme.colors.surface,
          boxShadow: mine ? undefined : theme.shadows.card.boxShadow,
        }}>
        {m.streaming && !m.text ? (
          <View style={{ gap: theme.space[1], width: 140 }}>
            <Skeleton height={10} />
            <Skeleton height={10} width="70%" />
          </View>
        ) : (
          <Text variant="body" color={mine ? theme.colors.textOnAccent : undefined}>
            {m.text}
          </Text>
        )}
      </View>
      {m.demo ? <Pill label={t('chat.demoLabel')} tone="warning" icon="flask-outline" /> : null}
      {m.sources?.length ? (
        <Text variant="caption" tone="tertiary">
          {t('chat.sources', { list: m.sources.map((s) => s.title).join(' · ') })}
        </Text>
      ) : null}
    </View>
  );
}

export default function PatientAssistant() {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const [input, setInput] = useState('');
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const chat = useAiChat({ demoText: (key) => t(`chat.demo.${key}`) });

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(id);
  }, [chat.messages]);

  const send = (text: string) => {
    setInput('');
    void chat.send(text);
  };

  const chips = chat.messages.length === 0 ? DEMO_CHIP_KEYS.map((k) => t(`chat.starters.${k}`)) : chat.chips;

  return (
    <Screen scroll={false} background="mist" padded={false} testID="screen-assistant">
      <ScreenGuide id="assistant" button={false} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3], paddingHorizontal: theme.layout.screenPaddingX, paddingVertical: theme.space[3] }}>
          <IconButton icon="chevron-back" flipInRTL accessibilityLabel={t('chat.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <Avatar name="AI" size="md" />
          <View style={{ flex: 1 }}>
            <Heading variant="h3">{t('chat.title')}</Heading>
            <Text variant="caption" tone="secondary">
              {chat.status === 'streaming' ? t('chat.thinking') : t('chat.subtitle')}
            </Text>
          </View>
          <IconButton icon="mic" accessibilityLabel={t('chat.voice')} onPress={() => router.push('/voice')} testID="open-voice" />
          <IconButton icon="trash-outline" accessibilityLabel={t('chat.clear')} onPress={() => void chat.clear()} />
        </View>

        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingHorizontal: theme.layout.screenPaddingX, paddingBottom: theme.space[4], gap: theme.space[3] }} keyboardShouldPersistTaps="handled">
          {chat.emergency ? <EmergencyBanner info={chat.emergency} onDismiss={chat.dismissEmergency} /> : null}
          {!chat.loaded ? (
            <View style={{ gap: theme.space[2] }}>
              <Skeleton height={48} radius={theme.radii.xl} />
              <Skeleton height={48} width="60%" radius={theme.radii.xl} />
            </View>
          ) : chat.messages.length === 0 ? (
            <Card radius="xl" padding="lg" testID="chat-welcome">
              <View style={{ gap: theme.space[2] }}>
                <Heading variant="h2">{t('chat.welcomeTitle')}</Heading>
                <Text tone="secondary">{t('chat.welcomeBody')}</Text>
                <Text variant="caption" tone="tertiary">
                  {t('chat.disclaimer')}
                </Text>
              </View>
            </Card>
          ) : (
            chat.messages.map((m) => <Bubble key={m.id} m={m} />)
          )}
        </ScrollView>

        {chips.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: theme.layout.screenPaddingX, gap: theme.space[2], paddingVertical: theme.space[2] }} keyboardShouldPersistTaps="handled">
            {chips.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="button"
                onPress={() => send(c)}
                disabled={chat.status === 'streaming'}
                testID="chip"
                style={{ minHeight: 44, paddingHorizontal: theme.space[4], borderRadius: theme.radii.full, backgroundColor: theme.accent.accentSoft, justifyContent: 'center' }}>
                <Text variant="label" color={theme.accent.accentSoftText}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space[2], paddingHorizontal: theme.layout.screenPaddingX, paddingVertical: theme.space[3], backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          <View style={{ flex: 1 }}>
            <TextField label={t('chat.inputLabel')} placeholder={t('chat.placeholder')} value={input} onChangeText={setInput} onSubmitEditing={() => send(input)} returnKeyType="send" testID="chat-input" />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
            accessibilityState={{ disabled: !input.trim() || chat.status === 'streaming' }}
            onPress={() => send(input)}
            disabled={!input.trim() || chat.status === 'streaming'}
            testID="chat-send"
            style={{ width: 52, height: 52, borderRadius: theme.radii.full, backgroundColor: input.trim() ? theme.accent.accent : theme.colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
            <Icon name="arrow-up" size={theme.sizes.icon.md} color={input.trim() ? theme.colors.textOnAccent : theme.colors.textTertiary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
