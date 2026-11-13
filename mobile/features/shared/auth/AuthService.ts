import type { Role } from '@/features/shared/state/session';

/** Result of a code request: where it went, and whether this is the demo flow. */
export type OtpRequest = { phone: string; demo: boolean };
export type AuthUser = { id: string; phone: string; role: Role };

export class AuthError extends Error {
  constructor(
    public readonly code: 'invalid_phone' | 'invalid_code' | 'network' | 'not_configured',
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
 * TODO(Phase B): Supabase phone auth.
 * requestOtp -> supabase.auth.signInWithOtp({ phone: '+91…' })
 * verifyOtp  -> supabase.auth.verifyOtp({ phone, token: code, type: 'sms' }), then read the role
 *               from the users table (RLS) instead of trusting the client's choice.
 * Needs EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY and an SMS provider in Supabase.
 */
export class SupabaseAuthService implements AuthService {
  readonly demo = false;
  async requestOtp(): Promise<OtpRequest> {
    throw new AuthError('not_configured', 'Supabase auth is not set up yet (Phase B)');
  }
  async verifyOtp(): Promise<AuthUser> {
    throw new AuthError('not_configured', 'Supabase auth is not set up yet (Phase B)');
  }
  async signOut() {}
}

/** Demo until Phase B. TODO(Phase B): return new SupabaseAuthService() once Supabase is configured. */
export function getAuthService(): AuthService {
  return new DemoAuthService();
}
