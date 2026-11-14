/**
 * ABDM (Ayushman Bharat Digital Mission) adapter configuration.
 *
 * DISABLED unless all three are set on the server (never in the app):
 *   ABDM_CLIENT_ID      sandbox client id issued by NHA after sandbox registration
 *   ABDM_CLIENT_SECRET  sandbox client secret
 *   ABDM_BASE_URL       gateway base, e.g. https://dev.abdm.gov.in/api/hiecm (sandbox)
 * Optional:
 *   ABDM_CM_ID          X-CM-ID header; 'sbx' for sandbox (default)
 *
 * The production gateway (apis.abdm.gov.in) is refused: going live needs NHA's
 * functional test, security audit and go-live approval first.
 */
import { readEnv } from '../../speech/config.ts';

export const ABDM_REQUIRED_ENV = ['ABDM_CLIENT_ID', 'ABDM_CLIENT_SECRET', 'ABDM_BASE_URL'] as const;
export const ABDM_SANDBOX_BASE_URL = 'https://dev.abdm.gov.in/api/hiecm';
export const ABDM_SESSION_PATH = '/gateway/v3/sessions';
const PRODUCTION_HOSTS = new Set(['apis.abdm.gov.in', 'live.abdm.gov.in']);

export interface AbdmConfig {
  clientId: string;
  clientSecret: string;
  /** Without a trailing slash. */
  baseUrl: string;
  cmId: string;
}

export interface AbdmConfigResult {
  config: AbdmConfig | null;
  /** Names (never values) of required variables that are unset. */
  missing: string[];
  /** Set when the variables are present but unusable. */
  problem?: string;
}

type Read = (name: string) => string | undefined;

export function abdmConfigFromEnv(read: Read = readEnv): AbdmConfigResult {
  const get = (k: string) => read(k)?.trim() || undefined;
  const missing = ABDM_REQUIRED_ENV.filter((k) => !get(k));
  if (missing.length) return { config: null, missing };
  const baseUrl = get('ABDM_BASE_URL')!.replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return { config: null, missing: [], problem: 'ABDM_BASE_URL is not a valid URL' };
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !local) return { config: null, missing: [], problem: 'ABDM_BASE_URL must use https (http only for a local mock gateway)' };
  if (PRODUCTION_HOSTS.has(url.hostname)) return { config: null, missing: [], problem: 'ABDM_BASE_URL points at the production gateway; this adapter is sandbox-only until NHA approves go-live' };
  const cmId = get('ABDM_CM_ID') ?? 'sbx';
  if (cmId === 'abdm') return { config: null, missing: [], problem: "ABDM_CM_ID 'abdm' is the production consent manager; use 'sbx'" };
  return { config: { clientId: get('ABDM_CLIENT_ID')!, clientSecret: get('ABDM_CLIENT_SECRET')!, baseUrl, cmId }, missing: [] };
}
