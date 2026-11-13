/**
 * Client logic for the patient's QR health card screen (no UI framework here).
 *
 * The screen asks the server for a token (`issueQrToken` behind an Edge
 * Function), renders `payload` as a large QR, and calls `nextRefreshDelayMs`
 * to schedule the next fetch so the code is replaced before it expires.
 */

export interface IssuedQr {
  payload: string;
  expiresAt: string;
  refreshAt: string;
}

/** Milliseconds until the next token fetch. Never negative, never later than expiry. */
export function nextRefreshDelayMs(qr: IssuedQr, now: Date, minDelayMs = 1_000): number {
  const refresh = Date.parse(qr.refreshAt) - now.getTime();
  const expiry = Date.parse(qr.expiresAt) - now.getTime();
  return Math.max(minDelayMs, Math.min(refresh, expiry - 5_000));
}

/** Retry delay after a failed refresh: 2 s, 4 s, 8 s … capped at 30 s. */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt));
}

/** Seconds left, for the "Refreshes in 0:42" caption. */
export function secondsLeft(qr: IssuedQr, now: Date): number {
  return Math.max(0, Math.floor((Date.parse(qr.expiresAt) - now.getTime()) / 1000));
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** A QR that has expired must never be shown as scannable. */
export function isUsable(qr: IssuedQr | null, now: Date): qr is IssuedQr {
  return qr !== null && Date.parse(qr.expiresAt) - now.getTime() > 5_000;
}
