/**
 * State for the patient's "My ASHA" screen: who my ASHA is (or that I am
 * waiting for one), the message thread with her, and sending messages and
 * visit / call-back requests.
 *
 * - The last answer is saved on the phone, so offline the screen still shows
 *   the ASHA card and thread, clearly marked as saved (never invented).
 * - While the screen is focused the thread is polled every 15 s.
 * - Every message is checked for emergency signs on the phone before it is
 *   sent, so the 108 banner appears at once, even offline; the server's own
 *   check (the `emergency` in its reply) shows it too.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { localEmergency } from '@/features/patient/chat/useAiChat';
import type { EmergencyInfo as BannerInfo } from '@/features/patient/chat/types';
import { currentPatientId } from '@/features/shared/state/session';

import { findMyAsha, getMyAsha, listMessages, markThreadRead, sendMessage, type MyAsha } from '../api';
import type { AshaMessage, MessageKind, VisitWhen } from '../types';

export const POLL_MS = 15_000;
const cacheKey = (pid: string) => `ashaConnect.mine.v1:${pid}`;
type Cache = { mine: MyAsha; messages: AshaMessage[] };

const strip = <T extends { ok: true }>(r: T): Omit<T, 'ok'> => {
  const { ok: _ok, ...rest } = r;
  return rest;
};

/** Oldest first, one row per id (a later copy wins: status changes arrive as updates). */
export function mergeMessages(a: AshaMessage[], b: AshaMessage[]): AshaMessage[] {
  const byId = new Map<string, AshaMessage>();
  for (const m of a) byId.set(m.id, m);
  for (const m of b) {
    const old = byId.get(m.id);
    if (!old || old.updatedAt <= m.updatedAt) byId.set(m.id, m);
  }
  return [...byId.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
}

export type FindResult = { ok: true; method: 'area_match' | 'waiting' | undefined; mine: MyAsha } | { ok: false; reason: string };
export type SendResult = { ok: true } | { ok: false; reason: string };

export function useMyAsha() {
  const patientId = currentPatientId();
  const [mine, setMine] = useState<MyAsha | null>(null);
  const [messages, setMessages] = useState<AshaMessage[]>([]);
  const [loading, setLoading] = useState(true);
  /** Last call failed for lack of network; what is shown came from the phone. */
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emergency, setEmergency] = useState<BannerInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const since = useRef<string | undefined>(undefined);
  const latest = useRef<{ mine: MyAsha | null; messages: AshaMessage[] }>({ mine: null, messages: [] });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const save = useCallback(
    (next: Partial<Cache>) => {
      latest.current = { ...latest.current, ...next };
      if (!latest.current.mine) return;
      AsyncStorage.setItem(cacheKey(patientId), JSON.stringify(latest.current)).catch(() => undefined);
    },
    [patientId]
  );

  const applyMine = useCallback(
    (m: MyAsha) => {
      setMine(m);
      save({ mine: m });
    },
    [save]
  );

  const applyMessages = useCallback(
    (incoming: AshaMessage[]) => {
      const merged = mergeMessages(latest.current.messages, incoming);
      setMessages(merged);
      save({ messages: merged });
      return merged;
    },
    [save]
  );

  // Saved copy first (instant, and all there is when offline).
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(cacheKey(patientId))
      .then((raw) => {
        if (cancelled || !raw || latest.current.mine) return;
        const c = JSON.parse(raw) as Cache;
        if (!c?.mine) return;
        latest.current = c;
        setMine(c.mine);
        setMessages(c.messages ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const load = useCallback(async () => {
    const r = await getMyAsha();
    if (!alive.current) return;
    if (r.ok) {
      const m = strip(r);
      // A different ASHA (or none) means the old thread is not hers: start again.
      if (latest.current.mine?.asha?.id !== m.asha?.id) {
        since.current = undefined;
        latest.current = { mine: m, messages: [] };
        setMessages([]);
      }
      applyMine(m);
      setOffline(false);
      setError(null);
    } else if (r.reason === 'offline') {
      setOffline(true);
    } else {
      setError(r.reason);
    }
    setLoading(false);
  }, [applyMine]);

  const poll = useCallback(
    async (first: boolean) => {
      const r = await listMessages({ since: since.current });
      if (!alive.current) return;
      if (!r.ok) {
        if (r.reason === 'offline') setOffline(true);
        return;
      }
      setOffline(false);
      since.current = r.serverTime;
      const merged = applyMessages(r.messages);
      if (first || merged.some((m) => m.from === 'asha' && !m.readAt)) {
        const read = await markThreadRead();
        if (read.ok && alive.current) {
          const at = new Date().toISOString();
          setMessages((cur) => cur.map((m) => (m.from === 'asha' && !m.readAt ? { ...m, readAt: at } : m)));
        }
      }
    },
    [applyMessages]
  );

  const hasAsha = !!mine?.asha;

  // Refresh "my ASHA" every time the screen comes into view.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // While focused and assigned: the thread now, then every 15 s.
  useFocusEffect(
    useCallback(() => {
      if (!hasAsha) return undefined;
      void poll(true);
      const id = setInterval(() => void poll(false), POLL_MS);
      return () => clearInterval(id);
    }, [hasAsha, poll])
  );

  const find = useCallback(
    async (area: string): Promise<FindResult> => {
      setBusy(true);
      const r = await findMyAsha(area.trim());
      if (!alive.current) return { ok: false, reason: 'gone' };
      setBusy(false);
      if (!r.ok) {
        if (r.reason === 'offline') setOffline(true);
        return r;
      }
      setOffline(false);
      const m = strip(r);
      applyMine(m);
      return { ok: true, method: r.method, mine: m };
    },
    [applyMine]
  );

  const send = useCallback(
    async (kind: MessageKind, body: string, visitWhen?: VisitWhen): Promise<SendResult> => {
      const text = body.trim();
      // Safety first: an emergency sign shows the 108 banner before anything goes over the network.
      const local = text ? localEmergency(text) : null;
      if (local) setEmergency(local);
      setBusy(true);
      const r = await sendMessage({ kind, body: text, visitWhen });
      if (!alive.current) return { ok: false, reason: 'gone' };
      setBusy(false);
      if (!r.ok) {
        if (r.reason === 'offline') setOffline(true);
        if (r.reason === 'no_asha') void load();
        return r;
      }
      setOffline(false);
      applyMessages([r.message]);
      if (r.emergency) setEmergency({ categories: r.emergency.categories, contacts: r.emergency.contacts, steps: [] });
      return { ok: true };
    },
    [applyMessages, load]
  );

  return {
    mine,
    messages,
    loading: loading && !mine,
    offline,
    error,
    busy,
    emergency,
    dismissEmergency: () => setEmergency(null),
    reload: load,
    find,
    send,
  };
}
