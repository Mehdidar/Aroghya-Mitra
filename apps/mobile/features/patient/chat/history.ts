import AsyncStorage from '@react-native-async-storage/async-storage';

import { ChatHistoryStore } from '@am/patient-ai';
import type { StoredMessage } from '@am/patient-ai/chat/historyStore';

import type { ChatMessage } from './types';

export const chatHistory = new ChatHistoryStore(AsyncStorage);

export function toStored(m: ChatMessage): StoredMessage {
  return { id: m.id, role: m.role, content: m.text, createdAt: m.createdAt, emergency: !!m.emergency, sources: m.sources?.map((s) => ({ id: s.id, title: s.title, url: s.url })) };
}

export function fromStored(s: StoredMessage): ChatMessage {
  return { id: s.id, role: s.role, text: s.content, createdAt: s.createdAt, sources: s.sources?.map((x: { id: string; title: string; url: string }) => ({ ...x })) };
}
