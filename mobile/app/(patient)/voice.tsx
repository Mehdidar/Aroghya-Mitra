import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { askHealthAI, type AiChatMessage } from '@/features/shared/services/ai/geminiHealthChat';
import { usePatientVoice } from '@/features/shared/services/voice/patientVoice';
import { useSession } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import {
  GlowingMedicalOrb,
  Icon,
  Screen,
  Text,
} from '@/features/shared/ui';

const SPEECH_TRANSCRIPTS = [
  '"I see your recent reports, let me explain the results..."',
  '"Your blood glucose and hemoglobin levels are well within the target range."',
  '"Based on your symptoms, please stay hydrated and avoid strenuous activity."',
  '"A copy of this consultation summary has been saved to your health records."',
];

/**
 * AI Voice Consultation screen matching Image 2.
 * Features live ticking timer, glowing ambient blue orb, real Sarvam STT transcription,
 * real Gemini AI clinical intelligence, and tactile call controls.
 */
export default function VoiceConsultation() {
  const theme = useTheme();
  const sessionLang = useSession((s) => s.language);
  const lang = sessionLang === 'hi' ? 'hi' : 'en';

  const [seconds, setSeconds] = useState(739); // Starts at 12:19 (per design Image 2)
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [currentSpeech, setCurrentSpeech] = useState<string>(SPEECH_TRANSCRIPTS[0]);
  const [history, setHistory] = useState<AiChatMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const voice = usePatientVoice(lang);
  const isRecording = voice.state === 'recording';
  const isTranscribing = voice.state === 'transcribing';

  // Ticking duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleAiQuery = useCallback(
    async (userText: string) => {
      if (!userText.trim()) return;
      setCurrentSpeech(`"${userText}"`);
      setIsAiThinking(true);

      try {
        const res = await askHealthAI(userText, history, lang);
        setCurrentSpeech(`"${res.text}"`);
        setHistory((prev) => [
          ...prev,
          { role: 'user', text: userText },
          { role: 'model', text: res.text },
        ]);
      } catch {
        setCurrentSpeech('"I heard you. Please tell me more about how you feel."');
      } finally {
        setIsAiThinking(false);
      }
    },
    [history, lang]
  );

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await voice.stop();
    } else {
      await voice.start((transcript) => {
        if (transcript) {
          void handleAiQuery(transcript);
        }
      });
    }
  }, [isRecording, voice, handleAiQuery]);

  const handleEndCall = () => {
    if (isRecording) {
      voice.stop().catch(() => undefined);
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const getSubStatus = () => {
    if (isRecording) return `Listening... (${voice.seconds}s) Tap to send`;
    if (isTranscribing) return 'Transcribing with Sarvam AI...';
    if (isAiThinking) return 'Viora AI is analyzing...';
    return formatTime(seconds);
  };

  return (
    <Screen
      background="hero"
      testID="screen-voice-consultation"
      contentStyle={{
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 20,
      }}>
      {/* Top Header: Title and Live Duration */}
      <View style={{ alignItems: 'center', gap: 6, marginTop: 12 }}>
        <Text variant="title" weight="semibold" style={{ color: '#0F172A', fontSize: 18 }}>
          AI Health Assistant
        </Text>
        <Text
          variant="bodySmall"
          weight="medium"
          style={{
            color: isRecording ? '#EF4444' : isAiThinking ? '#0284C7' : '#64748B',
          }}>
          {getSubStatus()}
        </Text>
      </View>

      {/* Center Section: Glowing Ambient Orb & Speech Bubble (Image 2) */}
      <View style={{ alignItems: 'center', justifyContent: 'center', gap: 32 }}>
        {/* Floating live transcription quotation text */}
        <View
          style={{
            maxWidth: 320,
            minHeight: 64,
            justifyContent: 'center',
            paddingHorizontal: 20,
            paddingVertical: 14,
            borderRadius: 24,
            backgroundColor: 'rgba(255, 255, 255, 0.85)',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.95)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.06,
            shadowRadius: 14,
          }}>
          <Text
            variant="title"
            weight="semibold"
            align="center"
            style={{
              color: '#0F172A',
              fontSize: 17,
              lineHeight: 25,
            }}>
            {currentSpeech}
          </Text>
        </View>

        {/* Big Glowing Ambient Orb (Tappable to speak / stop) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voice assistant orb"
          onPress={toggleRecording}
          style={({ pressed }) => ({
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.96 : 1 }],
          })}>
          <GlowingMedicalOrb
            size={170}
            variant="voice"
            pulse={isRecording || isAiThinking}
          />
        </Pressable>

        {/* Audio Waveform Bars */}
        <AudioWaveform active={isRecording} />

        {/* Tap orb prompt hint */}
        <Text variant="caption" style={{ color: '#64748B' }}>
          {isRecording ? 'Tap orb when done speaking' : 'Tap glowing orb to speak'}
        </Text>
      </View>

      {/* Bottom Call Controls (Image 2) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          marginBottom: 20,
        }}>
        {/* Mute Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          onPress={() => setIsMuted((prev) => !prev)}
          style={({ pressed }) => ({
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: isMuted ? '#FEE2E2' : 'rgba(255, 255, 255, 0.85)',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: isMuted ? '#FCA5A5' : 'rgba(255, 255, 255, 0.9)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            opacity: pressed ? 0.85 : 1,
          })}>
          <Icon
            name={isMuted ? 'mic-off' : 'mic'}
            size={26}
            color={isMuted ? '#DC2626' : '#0F172A'}
          />
        </Pressable>

        {/* End Call Button (Red pill circle) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End call"
          onPress={handleEndCall}
          style={({ pressed }) => ({
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: '#EF4444',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#EF4444',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 14,
            elevation: 6,
            opacity: pressed ? 0.88 : 1,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}>
          <View style={{ transform: [{ rotate: '135deg' }] }}>
            <Icon name="call" size={32} color="#FFFFFF" />
          </View>
        </Pressable>

        {/* Keypad / Options Button (Grid of dots) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keypad actions"
          onPress={() => setIsSpeaker((prev) => !prev)}
          style={({ pressed }) => ({
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: isSpeaker ? 'rgba(255, 255, 255, 0.85)' : '#F1F5F9',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.9)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            opacity: pressed ? 0.85 : 1,
          })}>
          <Icon name="keypad" size={26} color="#0F172A" />
        </Pressable>
      </View>
    </Screen>
  );
}

function AudioWaveform({ active = false }: { active?: boolean }) {
  const bars = active
    ? [0.7, 1.0, 0.6, 0.95, 0.8, 0.4, 0.85]
    : [0.3, 0.5, 0.7, 0.45, 0.6, 0.35, 0.2];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40 }}>
      {bars.map((val, i) => (
        <View
          key={i}
          style={{
            width: 4,
            height: 8 + val * 24,
            borderRadius: 2,
            backgroundColor: active ? '#0284C7' : '#94A3B8',
            opacity: active ? 0.95 : 0.6,
          }}
        />
      ))}
    </View>
  );
}
