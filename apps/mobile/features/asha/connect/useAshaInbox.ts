/**
 * The ASHA's patient messages (ASHA connect), kept in memory and cached in AsyncStorage so the
 * inbox still shows on a phone that went offline. One shared store for every screen; any screen
 * that uses the hook refreshes it after each successful sync, when it gains focus, when the app
 * comes to the foreground and every 30 s while online. Without a server (config.apiUrl empty)
 * nothing is fetched and the screens say messages need an internet connection.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { listMessages } from '@/features/ashaConnect/api';
import type { AshaMessage } from '@/features/ashaConnect/types';

import { config } from '../services/config';
import { useAsha } from '../store/AshaContext';
import { groupThreads, mergeMessages, planItems, totalUnread, type Thread } from './inbox';

export type InboxStatus = 'no_server' | 'idle' | 'loading' | 'offline' | 'error';

interface InboxState {
  ashaId: string | null;
  messages: AshaMessage[];
  status: InboxStatus;
  /** Server reason of the last failed load (for logs; the UI shows a plain message). */
  reason: string | null;
  loadedAt: string | null;
  hydrated: boolean;
}

const POLL_MS = 30_000;
/** Several screens may ask at once (focus + sync + timer): one request per this window. */
const MIN_GAP_MS = 4_000;
const cacheKey = (ashaId: string) => `asha.inbox.v1.${ashaId}`;
const hasServer = () => !!config.apiUrl;

export const useInboxStore = create<InboxState>(() => ({
  ashaId: null,
  messages: [],
  status: hasServer() ? 'idle' : 'no_server',
  reason: null,
  loadedAt: null,
  hydrated: false,
}));

let inflight: Promise<void> | null = null;
let lastStart = 0;

function persist(ashaId: string, messages: AshaMessage[]) {
  AsyncStorage.setItem(cacheKey(ashaId), JSON.stringify(messages.slice(-500))).catch(() => undefined);
}

/** Loads the cached messages for this ASHA once (and forgets another ASHA's messages). */
async function hydrate(ashaId: string) {
  const s = useInboxStore.getState();
  if (s.hydrated && s.ashaId === ashaId) return;
  useInboxStore.setState({ ashaId, messages: [], hydrated: true, loadedAt: null });
  try {
    const raw = await AsyncStorage.getItem(cacheKey(ashaId));
    const cached = raw ? (JSON.parse(raw) as AshaMessage[]) : [];
    if (Array.isArray(cached) && useInboxStore.getState().ashaId === ashaId) {
      useInboxStore.setState((st) => ({ messages: mergeMessages(cached, st.messages) }));
    }
  } catch {
    // A broken cache only costs the offline copy.
  }
}

/** Fetches the caseload's messages. Keeps the cached copy when offline. */
export function refreshInbox(ashaId: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!hasServer()) {
    useInboxStore.setState({ status: 'no_server' });
    return Promise.resolve();
  }
  if (inflight) return inflight;
  if (!opts.force && Date.now() - lastStart < MIN_GAP_MS) return Promise.resolve();
  lastStart = Date.now();
  inflight = (async () => {
    await hydrate(ashaId);
    if (!useInboxStore.getState().loadedAt) useInboxStore.setState({ status: 'loading' });
    const r = await listMessages();
    if (useInboxStore.getState().ashaId !== ashaId) return;
    if (r.ok) {
      // A full list of her caseload: replaces the cache (messages of released patients go away).
      const messages = mergeMessages([], r.messages);
      useInboxStore.setState({ messages, status: 'idle', reason: null, loadedAt: r.serverTime });
      persist(ashaId, messages);
    } else {
      useInboxStore.setState({ status: r.reason === 'offline' ? 'offline' : 'error', reason: r.reason });
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Tests only: forget everything (messages, throttle). */
export function resetInbox() {
  inflight = null;
  lastStart = 0;
  useInboxStore.setState({ ashaId: null, messages: [], status: hasServer() ? 'idle' : 'no_server', reason: null, loadedAt: null, hydrated: false });
}

/** Puts one message the server just returned (sent, accepted, declined…) into the inbox. */
export function upsertInboxMessage(m: AshaMessage) {
  const s = useInboxStore.getState();
  const messages = mergeMessages(s.messages, [m]);
  useInboxStore.setState({ messages });
  if (s.ashaId) persist(s.ashaId, messages);
}

/** Marks the patient's messages in one thread read on the phone (the server call is markThreadRead). */
export function markThreadReadLocal(threadKey: (m: AshaMessage) => boolean) {
  const s = useInboxStore.getState();
  const at = new Date().toISOString();
  let changed = false;
  const messages = s.messages.map((m) => {
    if (m.from !== 'patient' || m.readAt || !threadKey(m)) return m;
    changed = true;
    return { ...m, readAt: at };
  });
  if (!changed) return;
  useInboxStore.setState({ messages });
  if (s.ashaId) persist(s.ashaId, messages);
}

export interface AshaInbox {
  available: boolean;
  status: InboxStatus;
  messages: AshaMessage[];
  threads: Thread[];
  unread: number;
  urgent: Thread[];
  openRequests: number;
  plan: ReturnType<typeof planItems>;
  loadedAt: string | null;
  refresh: () => Promise<void>;
}

export function useAshaInbox(): AshaInbox {
  const { user, sync, online, db } = useAsha();
  const ashaId = user.id;
  const messages = useInboxStore((s) => s.messages);
  const status = useInboxStore((s) => s.status);
  const loadedAt = useInboxStore((s) => s.loadedAt);
  const available = hasServer();

  useEffect(() => {
    void hydrate(ashaId);
  }, [ashaId]);

  // After every successful sync (assignments may have changed).
  const lastSyncAt = sync.kind === 'idle' ? sync.lastSyncAt : undefined;
  useEffect(() => {
    if (available && lastSyncAt) void refreshInbox(ashaId);
  }, [available, lastSyncAt, ashaId]);

  // When a screen using it comes into view.
  useFocusEffect(
    useCallback(() => {
      if (available) void refreshInbox(ashaId);
    }, [available, ashaId]),
  );

  // Every 30 s while online, and when the app returns to the foreground.
  useEffect(() => {
    if (!available || !online) return;
    const timer = setInterval(() => void refreshInbox(ashaId), POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refreshInbox(ashaId));
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [available, online, ashaId]);

  const threads = useMemo(() => groupThreads(messages, db.patients), [messages, db.patients]);
  const plan = useMemo(() => planItems(threads, Object.values(db.visits)), [threads, db.visits]);
  const refresh = useCallback(() => refreshInbox(ashaId, { force: true }), [ashaId]);

  return {
    available,
    status: available ? (!online && status !== 'loading' ? 'offline' : status) : 'no_server',
    messages,
    threads,
    unread: totalUnread(threads),
    urgent: threads.filter((t) => t.urgent),
    openRequests: threads.reduce((n, t) => n + t.openRequests.length, 0),
    plan,
    loadedAt,
    refresh,
  };
}
