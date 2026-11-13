/**
 * Chat history saved on the phone only (never sent to our server for storage).
 * Storage is injected: pass @react-native-async-storage/async-storage, or a
 * memory map in tests.
 */

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string; // ISO
  /** Assistant replies that showed the emergency banner. */
  emergency?: boolean;
  sources?: { id: string; title: string; url: string }[];
}

const KEY = 'patient-ai/chat-history/v1';
export const MAX_STORED_MESSAGES = 200;

export class ChatHistoryStore {
  constructor(private readonly storage: KeyValueStorage, private readonly key = KEY) {}

  async load(): Promise<StoredMessage[]> {
    try {
      const raw = await this.storage.getItem(this.key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { version?: number; messages?: StoredMessage[] };
      return Array.isArray(parsed.messages) ? parsed.messages.filter(isMessage) : [];
    } catch {
      return []; // corrupt data must never crash the chat screen
    }
  }

  async append(...messages: StoredMessage[]): Promise<StoredMessage[]> {
    const all = [...(await this.load()), ...messages].slice(-MAX_STORED_MESSAGES);
    await this.storage.setItem(this.key, JSON.stringify({ version: 1, messages: all }));
    return all;
  }

  async clear(): Promise<void> {
    await this.storage.removeItem(this.key);
  }
}

function isMessage(m: unknown): m is StoredMessage {
  const x = m as StoredMessage;
  return !!x && typeof x.id === 'string' && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string';
}
