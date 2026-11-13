import { useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/features/shared/theme';
import {
  Avatar,
  Icon,
  IconButton,
  Screen,
  Text,
} from '@/features/shared/ui';

type Message = {
  id: string;
  sender: 'doctor' | 'patient';
  text: string;
  time: string;
};

export default function DoctorChatScreen() {
  const params = useLocalSearchParams<{ doctor?: string }>();
  const doctorName = params.doctor || 'Dr. Olivia Wilson';
  const theme = useTheme();
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm1',
      sender: 'doctor',
      text: `Hello Lakshmi! I reviewed your recent skin sensitivity report and lab tests. How has the itching been since applying the prescribed ointment?`,
      time: '11:20 AM',
    },
    {
      id: 'm2',
      sender: 'patient',
      text: 'Good morning Doctor! The redness has reduced significantly, but there is still slight dryness in the evening.',
      time: '11:25 AM',
    },
    {
      id: 'm3',
      sender: 'doctor',
      text: 'That is great progress. Please continue the moisturizer twice daily after gentle cleansing. If dryness continues past this Friday, let us schedule a video follow-up.',
      time: '11:28 AM',
    },
  ]);
  const scrollRef = useRef<any>(null);

  const handleSend = () => {
    if (!inputText.trim()) return;
    const newMsg: Message = {
      id: String(Date.now()),
      sender: 'patient',
      text: inputText.trim(),
      time: 'Just now',
    };
    setMessages((prev) => [...prev, newMsg]);
    setInputText('');

    setTimeout(() => {
      const reply: Message = {
        id: String(Date.now() + 1),
        sender: 'doctor',
        text: 'Noted! I have updated your follow-up notes. Let me know if you need any prescription refills.',
        time: 'Just now',
      };
      setMessages((prev) => [...prev, reply]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, 1000);
  };

  const handleAttach = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      if (!res.canceled) {
        setMessages((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            sender: 'patient',
            text: 'Attached image for review.',
            time: 'Just now',
          },
        ]);
      }
    } catch {
      // ignore
    }
  };

  return (
    <Screen testID="screen-doctor-chat" contentStyle={{ paddingBottom: 0 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        {/* Header with Doctor Info and Call buttons */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: '#E2E8F0',
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconButton
              icon="arrow-back"
              accessibilityLabel="Back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/appointments'))}
              flipInRTL
            />
            <Avatar name={doctorName} size="md" />
            <View>
              <Text variant="bodyStrong" style={{ color: '#0F172A' }}>
                {doctorName}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                <Text variant="caption" tone="tertiary">
                  Online
                </Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <IconButton
              icon="call-outline"
              accessibilityLabel="Audio Call"
              onPress={() => router.push('/voice')}
            />
            <IconButton
              icon="videocam-outline"
              accessibilityLabel="Video Call"
              onPress={() => router.push('/voice')}
            />
          </View>
        </View>

        {/* Message Thread */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ gap: 14, paddingVertical: 16 }}
          showsVerticalScrollIndicator={false}>
          {messages.map((m) => (
            <View
              key={m.id}
              style={{
                alignSelf: m.sender === 'patient' ? 'flex-end' : 'flex-start',
                maxWidth: '82%',
                backgroundColor: m.sender === 'patient' ? '#0F172A' : '#F1F5F9',
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 12,
                gap: 4,
              }}>
              <Text
                variant="body"
                style={{
                  color: m.sender === 'patient' ? '#FFFFFF' : '#0F172A',
                  lineHeight: 22,
                }}>
                {m.text}
              </Text>
              <Text
                variant="caption"
                style={{
                  alignSelf: 'flex-end',
                  color: m.sender === 'patient' ? 'rgba(255,255,255,0.7)' : '#94A3B8',
                  fontSize: 10,
                }}>
                {m.time}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Input Bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: '#E2E8F0',
            backgroundColor: theme.colors.page,
          }}>
          <IconButton icon="attach" accessibilityLabel="Attach" onPress={handleAttach} />
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type your message..."
            placeholderTextColor="#94A3B8"
            onSubmitEditing={handleSend}
            returnKeyType="send"
            style={{
              flex: 1,
              backgroundColor: '#FFFFFF',
              borderRadius: 22,
              paddingHorizontal: 16,
              paddingVertical: 10,
              fontSize: 15,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              color: '#0F172A',
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={handleSend}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: '#0F172A',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            })}>
            <Icon name="arrow-up" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
