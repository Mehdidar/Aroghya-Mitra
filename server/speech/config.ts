import { SarvamClient, type SarvamClientOptions } from './sarvamClient';

/** Build the client from server environment variables. Throws if SARVAM_API_KEY is missing. */
export function createSarvamClientFromEnv(overrides: Partial<SarvamClientOptions> = {}): SarvamClient {
  const env = process.env;
  return new SarvamClient({
    apiKey: env.SARVAM_API_KEY ?? '',
    baseUrl: env.SARVAM_BASE_URL || undefined,
    chatModel: env.SARVAM_CHAT_MODEL || undefined,
    timeoutMs: env.SARVAM_TIMEOUT_MS ? Number(env.SARVAM_TIMEOUT_MS) : undefined,
    ...overrides,
  });
}
