import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { apiJson, setSessionToken } from '@/features/shared/services/api';
import { patientConfig } from '@/features/shared/services/config';
import type { Role } from '@/features/shared/state/session';

/** Result of a code request: where it went, and whether this is the demo flow. */
export type OtpRequest = { phone: string; demo: boolean };
export type AuthUser = {
  id: string;
  phone: string;
  role: Role;
  /** The patient record this user owns (patients only; created by the server on first sign-in). */
  patientId?: string | null;
  fullName?: string;
};

export class AuthError extends Error {
  constructor(
    public readonly code: 'invalid_phone' | 'invalid_code' | 'network' | 'not_configured' | 'wrong_role',
    message?: string
  ) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

/** Phone-OTP sign-in. Screens talk only to this interface. */
export interface AuthService {
  readonly demo: boolean;
  /** Sends a 6-digit code to an Indian mobile number (10 digits, without +91). */
  requestOtp(phone10: string): Promise<OtpRequest>;
  /** Verifies the code and returns the signed-in user for the chosen role. */
  verifyOtp(phone10: string, code: string, role: Role): Promise<AuthUser>;
  signOut(): Promise<void>;
}

export const DEMO_OTP = '123456';
export const isValidIndianMobile = (digits: string) => /^[6-9]\d{9}$/.test(digits);

/** Demo mode: no SMS is sent; the code is always 123456 (shown on screen). */
export class DemoAuthService implements AuthService {
  readonly demo = true;
  async requestOtp(phone10: string): Promise<OtpRequest> {
    if (!isValidIndianMobile(phone10)) throw new AuthError('invalid_phone');
    return { phone: `+91${phone10}`, demo: true };
  }
  async verifyOtp(phone10: string, code: string, role: Role): Promise<AuthUser> {
    if (!isValidIndianMobile(phone10)) throw new AuthError('invalid_phone');
    if (code !== DEMO_OTP) throw new AuthError('invalid_code');
    return { id: `demo-${role}-${phone10.slice(-4)}`, phone: `+91${phone10}`, role };
  }
  async signOut() {}
}

/**
 * Does this Supabase project accept phone OTP sign-in? Reads the public auth settings once.
 * A project with phone auth switched off (the default) rejects every signInWithOtp call, so
 * the app would be unusable; instead it drops to demo mode and says so on screen.
 */
export async function supabasePhoneAuthEnabled(fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<boolean> {
  try {
    const res = await fetchImpl(`${patientConfig.supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: patientConfig.supabaseAnonKey },
    });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: { phone?: boolean } };
    return settings.external?.phone === true;
  } catch {
    return false;
  }
}

let client: SupabaseClient | null = null;
/** One Supabase client for the app, with the session kept across launches (AsyncStorage). */
export function supabaseClient(): SupabaseClient | null {
  if (!patientConfig.supabaseUrl || !patientConfig.supabaseAnonKey) return null;
  if (!client) {
    client = createClient(patientConfig.supabaseUrl, patientConfig.supabaseAnonKey, {
      auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: Platform.OS === 'web' },
    });
    // Every token refresh reaches the server calls (Authorization: Bearer).
    client.auth.onAuthStateChange((_event, session) => setSessionToken(session?.access_token ?? null));
  }
  return client;
}

/** App start: put a saved Supabase session's token back on server calls. */
export async function restoreSupabaseSession(): Promise<void> {
  const c = supabaseClient();
  if (!c) return;
  try {
    const { data } = await c.auth.getSession();
    setSessionToken(data.session?.access_token ?? null);
  } catch {
    /* offline or no session */
  }
}

type Me = { ok: boolean; id: string; role: Role; fullName: string; patientId: string | null; isActive: boolean };

/** Real Supabase phone OTP auth (Phase B). Falls back to demo codes while the project cannot send SMS. */
export class SupabaseAuthService implements AuthService {
  readonly demo = false;
  private supabase = supabaseClient()!;
  private phoneEnabled: Promise<boolean> | null = null;
  private fallback = new DemoAuthService();
  /** Numbers that were given a demo code because the project could not send a real one. */
  private demoNumbers = new Set<string>();

  private async canSendSms(): Promise<boolean> {
    if (!this.phoneEnabled) this.phoneEnabled = supabasePhoneAuthEnabled();
    return this.phoneEnabled;
  }

  async requestOtp(phone10: string): Promise<OtpRequest> {
    if (!isValidIndianMobile(phone10)) throw new AuthError('invalid_phone');
    if (!(await this.canSendSms())) {
      this.demoNumbers.add(phone10);
      return this.fallback.requestOtp(phone10);
    }
    const { error } = await this.supabase.auth.signInWithOtp({
      phone: '+91' + phone10,
      options: { channel: 'sms' },
    });
    if (error) throw new AuthError('network', error.message);
    this.demoNumbers.delete(phone10);
    return { phone: '+91' + phone10, demo: false };
  }

  async verifyOtp(phone10: string, code: string, role: Role): Promise<AuthUser> {
    if (!isValidIndianMobile(phone10)) throw new AuthError('invalid_phone');
    if (this.demoNumbers.has(phone10)) return this.fallback.verifyOtp(phone10, code, role);
    const { data, error } = await this.supabase.auth.verifyOtp({
      phone: '+91' + phone10,
      token: code,
      type: 'sms',
    });
    if (error || !data.user || !data.session) throw new AuthError('invalid_code', error?.message);
    setSessionToken(data.session.access_token);
    // The role comes from the server (the token's app_metadata, set by an admin), never from the
    // role the user tapped: a new number is always a patient until an admin registers it as staff.
    let me: Me;
    try {
      me = await apiJson<Me>('/me');
    } catch (e) {
      await this.signOut();
      throw new AuthError('network', (e as Error).message);
    }
    if (me.role !== role && !(role === 'doctor' && me.role === 'admin')) {
      await this.signOut();
      throw new AuthError('wrong_role', me.role);
    }
    return { id: me.id, phone: '+91' + phone10, role: me.role, patientId: me.patientId, fullName: me.fullName };
  }

  async signOut(): Promise<void> {
    setSessionToken(null);
    await this.supabase.auth.signOut().catch(() => undefined);
  }
}

/** Returns SupabaseAuthService when Supabase is configured, otherwise DemoAuthService. */
export function getAuthService(): AuthService {
  if (patientConfig.supabaseUrl && patientConfig.supabaseAnonKey) {
    return new SupabaseAuthService();
  }
  return new DemoAuthService();
}
