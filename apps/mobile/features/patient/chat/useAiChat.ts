/**
 * Chat state for the assistant and voice screens: messages, streaming,
 * suggestion chips, the on-device red-flag check and the labelled demo path.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { detectRedFlags, EMERGENCY_CONTACTS } from '@am/patient-ai';

import { useSession } from '@/features/shared/state/session';

import { streamChat, type StreamChatOptions } from './chatClient';
import { demoReplyKey } from './demoReplies';
import { chatHistory, fromStored, toStored } from './history';
import type { ChatMessage, ChatTurn, EmergencyInfo } from './types';

export type ChatStatus = 'idle' | 'streaming' | 'error';

export interface UseAiChatOptions extends StreamChatOptions {
  mode?: 'text' | 'voice';
  /** Called with the finished assistant text (voice screen speaks it). */
  onReply?: (m: ChatMessage) => void;
  /** Skip AsyncStorage history (voice screen, tests). */
  persist?: boolean;
  /** Translates demo reply keys; returns the text to show. */
  demoText: (key: string) => string;
}

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** On-device emergency check, instant and offline. */
export function localEmergency(text: string): EmergencyInfo | null {
  const r = detectRedFlags(text);
  if (!r.isEmergency) return null;
  const contacts = r.contacts.length ? r.contacts : [EMERGENCY_CONTACTS.ambulance];
  return { categories: r.categories, contacts: contacts.map((c) => ({ number: c.number, labelKey: c.labelKey })), steps: [] };
}

export function useAiChat(opts: UseAiChatOptions) {
  const language = useSession((s) => s.language);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [emergency, setEmergency] = useState<EmergencyInfo | null>(null);
  const [loaded, setLoaded] = useState(opts.persist === false);
  const abortRef = useRef<AbortController | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (opts.persist === false) return;
    let alive = true;
    chatHistory
      .load()
      .then((stored) => {
        if (alive) setMessages(stored.map(fromStored));
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [opts.persist]);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || status === 'streaming') return;
      const o = optsRef.current;
      const user: ChatMessage = { id: nextId(), role: 'user', text, createdAt: new Date().toISOString() };
      const local = localEmergency(text);
      if (local) setEmergency(local);
      const history: ChatTurn[] = messages.filter((m) => !m.demo).slice(-12).map((m) => ({ role: m.role, text: m.text }));
      const replyId = nextId();
      const reply: ChatMessage = { id: replyId, role: 'assistant', text: '', createdAt: new Date().toISOString(), streaming: true, emergency: local ?? undefined };
      setMessages((prev) => [...prev, user, reply]);
      setChips([]);
      setStatus('streaming');
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const patch = (p: Partial<ChatMessage>) => setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, ...p } : m)));

      let final: ChatMessage = reply;
      try {
        let acc = '';
        for await (const ev of streamChat({ message: text, history, language, mode: o.mode ?? 'text' }, { fetchImpl: o.fetchImpl, signal: ctrl.signal, timeoutMs: o.timeoutMs })) {
          if (ev.type === 'delta') {
            acc += ev.text;
            patch({ text: acc });
          } else if (ev.type === 'emergency') {
            const info: EmergencyInfo = { categories: ev.categories, contacts: ev.contacts, steps: ev.steps };
            setEmergency(info);
            patch({ emergency: info });
            final = { ...final, emergency: info };
          } else if (ev.type === 'chips') setChips(ev.chips);
          else if (ev.type === 'sources') patch({ sources: ev.sources });
          else if (ev.type === 'error') throw new Error(ev.message);
        }
        final = { ...final, text: acc, streaming: false };
        patch({ text: acc, streaming: false });
        setStatus('idle');
        if (o.persist !== false) await chatHistory.append(toStored(user), toStored(final)).catch(() => undefined);
      } catch {
        // Unreachable or failed: a labelled demo answer, never a fake AI one.
        const demo = o.demoText(demoReplyKey(text));
        final = { ...final, text: demo, streaming: false, demo: true };
        patch({ text: demo, streaming: false, demo: true });
        setStatus('error');
      } finally {
        abortRef.current = null;
      }
      o.onReply?.(final);
      return final;
    },
    [language, messages, status],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const clear = useCallback(async () => {
    setMessages([]);
    setChips([]);
    setEmergency(null);
    setStatus('idle');
    if (opts.persist !== false) await chatHistory.clear().catch(() => undefined);
  }, [opts.persist]);

  return { messages, chips, status, emergency, loaded, send, stop, clear, dismissEmergency: () => setEmergency(null) };
}
