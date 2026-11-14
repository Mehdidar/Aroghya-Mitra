import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { buildDemoDB } from '../data/seed';
import { t as translate } from '../data/i18n';
import { config } from '../services/config';
import { authHeaders } from '@/features/shared/services/api';
import { createHttpTransport, syncOnce, type SyncTransport } from '../services/sync';
import type { AppUser, Lang } from '../types';
import { AshaStore, type AshaDB } from './store';

export type SyncStatus =
  | { kind: 'local' } // no server configured: data stays on the phone
  | { kind: 'offline' }
  | { kind: 'syncing' }
  | { kind: 'idle'; lastSyncAt?: string }
  | { kind: 'error'; message: string };

interface AshaContextValue {
  ready: boolean;
  db: AshaDB;
  store: AshaStore;
  user: AppUser;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  sync: SyncStatus;
  syncNow: () => Promise<void>;
  /** Phone has a network connection (NetInfo). */
  online: boolean;
}

const Ctx = createContext<AshaContextValue | null>(null);
const LANG_KEY = 'asha.lang';

export function AshaProvider({ children, user }: { children: React.ReactNode; user?: AppUser }) {
  const store = useMemo(() => new AshaStore(AsyncStorage), []);
  const transport = useMemo<SyncTransport | null>(() => (config.apiUrl ? createHttpTransport(config.apiUrl, undefined, authHeaders) : null), []);
  const me = useMemo<AppUser>(() => user ?? { id: config.ashaId, role: 'asha', name: config.ashaName }, [user]);

  const [db, setDb] = useState<AshaDB>(store.snapshot);
  const [ready, setReady] = useState(false);
  const [lang, setLangState] = useState<Lang>('hi');
  const [online, setOnline] = useState(true);
  const [sync, setSync] = useState<SyncStatus>(transport ? { kind: 'idle' } : { kind: 'local' });
  const onlineRef = useRef(online);
  onlineRef.current = online;

  useEffect(() => {
    const unsub = store.subscribe(setDb);
    (async () => {
      const [loaded, savedLang] = await Promise.all([store.load(), AsyncStorage.getItem(LANG_KEY).catch(() => null)]);
      const l = savedLang === 'en' || savedLang === 'hi' ? savedLang : 'hi';
      setLangState(l);
      if (config.demo && Object.keys(loaded.patients).length === 0) await store.seed(buildDemoDB(me.id, l));
      setReady(true);
    })();
    return () => {
      unsub();
    };
  }, [store, me.id]);

  const syncNow = useCallback(async () => {
    if (!transport) return;
    if (!onlineRef.current) {
      setSync({ kind: 'offline' });
      return;
    }
    setSync({ kind: 'syncing' });
    const res = await syncOnce(store, transport, me.id);
    setSync(res.ok ? { kind: 'idle', lastSyncAt: store.snapshot.lastSyncAt } : { kind: 'error', message: res.error });
  }, [store, transport, me.id]);

  // Connectivity: sync as soon as the phone comes back online.
  useEffect(() => {
    return NetInfo.addEventListener((s) => {
      const isOnline = Boolean(s.isConnected && s.isInternetReachable !== false);
      const cameOnline = isOnline && !onlineRef.current;
      onlineRef.current = isOnline;
      setOnline(isOnline);
      if (!transport) return;
      if (!isOnline) setSync({ kind: 'offline' });
      else if (cameOnline) void syncNow();
    });
  }, [syncNow, transport]);

  // Periodic + foreground sync while there is something to push (and to pull referral updates).
  useEffect(() => {
    if (!transport || !ready) return;
    void syncNow();
    const timer = setInterval(() => void syncNow(), config.syncIntervalMs);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void syncNow());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [transport, ready, syncNow]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(LANG_KEY, l).catch(() => undefined);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => translate(key, lang, params), [lang]);

  const value = useMemo<AshaContextValue>(
    () => ({ ready, db, store, user: me, lang, setLang, t, sync, syncNow, online }),
    [ready, db, store, me, lang, setLang, t, sync, syncNow, online],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAsha(): AshaContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAsha must be used inside <AshaProvider>');
  return v;
}
