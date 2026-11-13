import { useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/features/shared/theme';
import {
  GlowingMedicalOrb,
  Icon,
  IconButton,
  Screen,
  Text,
} from '@/features/shared/ui';
import { askHealthAI } from '@/features/shared/services/ai/geminiHealthChat';
import { usePatientVoice, sttConfigured } from '@/features/shared/services/voice/patientVoice';
import { useSession } from '@/features/shared/state/session';

type ChatMessage = {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  time: string;
  severity?: 'mild' | 'moderate' | 'urgent';
  recommendations?: string[];
};

type HistoryEntry = { role: 'user' | 'model'; text: string };

const INITIAL_SYMPTOMS = [
  'Headache',
  'Fever',
  'Cough',
  'Fatigue',
  'Nausea',
  'Sore throat',
  'Stomach pain',
  'Body ache',
];

/**
 * Symptom Checker & AI Health Assistant matching Image 4 (middle screen).
 * Includes glowing 3D capsule orb, quick symptom chips, prompt counter, and rich chat bar.
 */
export default function PatientAssistant() {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const language = useSession((s) => s.language);
  const [inputText, setInputText] = useState('');
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [chatHistory, setChatHistory] = useState<HistoryEntry[]>([]);
  const scrollRef = useRef<any>(null);

  // Voice recording — lang mapped to 'en'|'hi'; default to 'en' for other locales
  const voiceLang: 'en' | 'hi' = language === 'hi' ? 'hi' : 'en';
  const voice = usePatientVoice(voiceLang);
  const isRecording = voice.state === 'recording';
  const isTranscribing = voice.state === 'transcribing';

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text,
      time: 'Just now',
    };

    const updatedHistory: HistoryEntry[] = [...chatHistory, { role: 'user', text }];
    setChatHistory(updatedHistory);
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      const response = await askHealthAI(text, chatHistory, language);

      const aiMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: response.text,
        time: 'Just now',
        severity: response.severity ?? 'mild',
      };

      setChatHistory((prev) => [...prev, { role: 'model', text: response.text }]);
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: 'Sorry, I could not reach the health assistant. Please check your connection and try again.',
        time: 'Just now',
        severity: 'mild',
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  };

  const handleChipPress = (chip: string) => {
    setSelectedChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
    void handleSend(`I am having ${chip.toLowerCase()}.`);
  };

  const handlePickAttachment = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        void handleSend('Attached a medical photo/report for review.');
      }
    } catch {
      Alert.alert('Attachment', 'Simulated medical file attachment.');
    }
  };

  const handleMicPress = () => {
    if (isRecording) {
      void voice.stop();
    } else {
      void voice.start((transcript) => {
        if (transcript.trim()) {
          void handleSend(transcript.trim());
        }
      });
    }
  };

  const micIcon = isRecording ? 'stop-circle' : isTranscribing ? 'hourglass-outline' : 'mic';

  return (
    <Screen
      withTabBar
      testID="screen-patient-assistant"
      contentStyle={{ paddingBottom: 0 }}
      background="page">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        {/* Top Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 4,
            marginBottom: 8,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconButton
              icon="arrow-back"
              accessibilityLabel="Back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              flipInRTL
            />
            <Text variant="h2" weight="bold" style={{ color: '#0F172A' }}>
              Symptom checker
            </Text>
          </View>

          {/* Voice Mode Call Button (Image 2) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voice Consultation"
            onPress={() => router.push('/voice')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: '#E0F2FE',
              opacity: pressed ? 0.85 : 1,
            })}>
            <Icon name="mic" size={18} color="#0284C7" />
            <Text variant="caption" weight="bold" style={{ color: '#0284C7' }}>
              Voice Call
            </Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ gap: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}>
          {/* Subtitle & Introduction */}
          <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 12 }}>
            <Text variant="h2" weight="bold" align="center" style={{ color: '#0F172A' }}>
              How are you feeling?
            </Text>
            <Text variant="bodySmall" tone="secondary" align="center" style={{ maxWidth: 320, lineHeight: 22 }}>
              Describe what you&apos;re experiencing. Arogya AI will help you understand possible next steps.
            </Text>
          </View>

          {/* Center 3D Glowing Orb with inner capsule (Image 4 middle) */}
          <View style={{ alignItems: 'center', marginVertical: 8 }}>
            <GlowingMedicalOrb size={135} variant="capsule" pulse />
          </View>

          {/* Quick Symptom Chips Carousel */}
          <View style={{ gap: 8 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
              {INITIAL_SYMPTOMS.map((symptom, idx) => {
                const isSelected = selectedChips.includes(symptom) || (idx === 0 && selectedChips.length === 0);
                return (
                  <Pressable
                    key={symptom}
                    accessibilityRole="button"
                    onPress={() => handleChipPress(symptom)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 20,
                      backgroundColor: isSelected ? '#0F172A' : '#F1F5F9',
                      opacity: pressed ? 0.8 : 1,
                    })}>
                    <Text
                      variant="bodySmall"
                      weight="semibold"
                      style={{ color: isSelected ? '#FFFFFF' : '#334155' }}>
                      {symptom}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Conversation History */}
          {messages.length > 0 && (
            <View style={{ gap: 14, marginTop: 8 }}>
              {messages.map((msg) => (
                <View
                  key={msg.id}
                  style={{
                    alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '86%',
                    backgroundColor: msg.sender === 'user' ? '#0F172A' : '#FFFFFF',
                    borderRadius: 20,
                    padding: 16,
                    borderWidth: msg.sender === 'assistant' ? 1 : 0,
                    borderColor: '#E2E8F0',
                    gap: 8,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.04,
                    shadowRadius: 6,
                  }}>
                  {msg.sender === 'assistant' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name="sparkles" size={16} color="#0284C7" />
                      <Text variant="caption" weight="bold" style={{ color: '#0284C7' }}>
                        Arogya Clinical Assistant
                      </Text>
                      {msg.severity && (
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 10,
                            backgroundColor:
                              msg.severity === 'urgent'
                                ? '#FEE2E2'
                                : msg.severity === 'moderate'
                                  ? '#FEF3C7'
                                  : '#DCFCE7',
                          }}>
                          <Text
                            variant="caption"
                            weight="bold"
                            style={{
                              fontSize: 10,
                              color:
                                msg.severity === 'urgent'
                                  ? '#DC2626'
                                  : msg.severity === 'moderate'
                                    ? '#D97706'
                                    : '#16A34A',
                            }}>
                            {msg.severity.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  <Text
                    variant="body"
                    style={{
                      color: msg.sender === 'user' ? '#FFFFFF' : '#1E293B',
                      lineHeight: 24,
                    }}>
                    {msg.text}
                  </Text>

                  {/* Recommendations checklist */}
                  {msg.recommendations && msg.recommendations.length > 0 && (
                    <View style={{ gap: 6, marginTop: 4 }}>
                      <Text variant="caption" weight="bold" style={{ color: '#475569' }}>
                        Recommended Next Steps:
                      </Text>
                      {msg.recommendations.map((rec, i) => (
                        <View key={i} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                          <Icon name="checkmark-circle-outline" size={16} color="#0D9488" />
                          <Text variant="caption" style={{ color: '#334155', flex: 1, lineHeight: 18 }}>
                            {rec}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}

              {isTyping && (
                <View
                  style={{
                    alignSelf: 'flex-start',
                    backgroundColor: '#FFFFFF',
                    borderRadius: 20,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}>
                  <Text variant="caption" tone="tertiary">
                    Arogya AI is analyzing your symptoms...
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Footer Area: Prompt Counter & Input Bar (Image 4 middle) */}
        <View style={{ gap: 8, paddingBottom: 16, backgroundColor: theme.colors.page }}>
          {/* Prompts left badge */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 }}>
            <Text variant="caption" tone="tertiary" style={{ fontSize: 11 }}>
              You have 56 prompts left...
            </Text>
            <Text variant="caption" tone="tertiary" style={{ fontSize: 11 }}>
              Powered by Gemini
            </Text>
          </View>

          {/* Chat input pill container */}
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 28,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 8,
              gap: 4,
            }}>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Describe your symptoms with Arogya AI"
              placeholderTextColor="#94A3B8"
              onSubmitEditing={() => void handleSend()}
              returnKeyType="send"
              style={{
                fontSize: 15,
                color: '#0F172A',
                paddingHorizontal: 8,
                paddingVertical: 8,
                minHeight: 40,
              }}
            />

            {/* Input Action Buttons */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 4,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <IconButton
                  icon="add"
                  accessibilityLabel="Add actions"
                  onPress={() => Alert.alert('Actions', 'Choose medical action')}
                />
                <IconButton
                  icon="attach"
                  accessibilityLabel="Attach file"
                  onPress={handlePickAttachment}
                />
                <IconButton
                  icon="image-outline"
                  accessibilityLabel="Attach image"
                  onPress={handlePickAttachment}
                />
                {sttConfigured() ? (
                  <IconButton
                    icon={micIcon}
                    accessibilityLabel={isRecording ? 'Stop recording' : 'Start voice input'}
                    onPress={handleMicPress}
                  />
                ) : (
                  <IconButton
                    icon="mic-outline"
                    accessibilityLabel="Voice check"
                    onPress={() => router.push('/voice')}
                  />
                )}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                onPress={() => void handleSend()}
                style={({ pressed }) => ({
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: '#0F172A',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.8 : 1,
                })}>
                <Icon name="arrow-forward" size={18} color="#FFFFFF" flipInRTL />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
