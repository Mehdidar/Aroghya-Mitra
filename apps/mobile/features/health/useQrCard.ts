/**
 * The patient's QR health card: fetch a token, show it, refresh before it
 * expires, back off on failure, and fall back to an offline demo code when
 * the server cannot be reached (clearly labelled on screen).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { formatCountdown, isUsable, nextRefreshDelayMs, retryDelayMs, secondsLeft, type IssuedQr } from '@am/records';

import { currentPatientId } from '@/features/shared/state/session';
import { ApiError, apiJson } from '@/features/shared/services/api';

export const DEMO_QR_PREFIX = 'AM1.demo.';

export type IssueResponse = { ok: true; payload: string; expiresAt: string; refreshAt: string; ttlSeconds: number; demo?: boolean } | { ok: false; reason: string };

export type QrCardState =
  | { kind: 'loading' }
  | { kind: 'ready'; qr: IssuedQr; mode: 'server' | 'server-demo' | 'offline'; secondsLeft: number }
  | { kind: 'paused' }
  | { kind: 'error'; message: string };

export function offlineQr(patientId: string, now = new Date()): IssuedQr {
  const exp = new Date(now.getTime() + 10 * 60_000);
  return { payload: `${DEMO_QR_PREFIX}${patientId}`, expiresAt: exp.toISOString(), refreshAt: new Date(exp.getTime() - 60_000).toISOString() };
}

export function useQrCard(opts: { shareHistory: boolean; patientId?: string; fetchImpl?: typeof fetch }): QrCardState & { refresh: () => void; countdown: string } {
  const patientId = opts.patientId ?? currentPatientId();
  const [state, setState] = useState<QrCardState>({ kind: 'loading' });
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const schedule = useCallback((ms: number, fn: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  }, []);

  const load = useCallback(async () => {
    if (!opts.shareHistory) {
      setState({ kind: 'paused' });
      return;
    }
    try {
      const r = await apiJson<IssueResponse>('/qr/issue', {}, { timeoutMs: 6000, fetchImpl: opts.fetchImpl });
      if (!alive.current) return;
      if (!r.ok) {
        setState(r.reason === 'consent_off' ? { kind: 'paused' } : { kind: 'error', message: r.reason });
        return;
      }
      attempt.current = 0;
      const qr: IssuedQr = { payload: r.payload, expiresAt: r.expiresAt, refreshAt: r.refreshAt };
      setState({ kind: 'ready', qr, mode: r.demo ? 'server-demo' : 'server', secondsLeft: secondsLeft(qr, new Date()) });
      schedule(nextRefreshDelayMs(qr, new Date()), () => void load());
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.status === 403) {
        setState({ kind: 'paused' });
        return;
      }
      // Unreachable: show the offline demo code and keep trying the server in the background.
      const qr = offlineQr(patientId);
      setState({ kind: 'ready', qr, mode: 'offline', secondsLeft: secondsLeft(qr, new Date()) });
      schedule(retryDelayMs(attempt.current++), () => void load());
    }
  }, [opts.shareHistory, opts.fetchImpl, patientId, schedule]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  // One-second countdown while a code is showing.
  useEffect(() => {
    if (state.kind !== 'ready') return;
    const id = setInterval(() => {
      setState((s) => {
        if (s.kind !== 'ready') return s;
        const left = secondsLeft(s.qr, new Date());
        if (!isUsable(s.qr, new Date())) return { kind: 'loading' };
        return { ...s, secondsLeft: left };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state.kind]);

  return { ...state, refresh: () => void load(), countdown: state.kind === 'ready' ? formatCountdown(state.secondsLeft) : '' };
}
