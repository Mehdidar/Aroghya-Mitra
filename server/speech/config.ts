import { SarvamClient, type SarvamClientOptions } from './sarvamClient.ts';

/** Reads an environment variable in Node (`process.env`) or Deno / Supabase Edge Functions (`Deno.env`). */
export function readEnv(name: string): string | undefined {
  const g = globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
    Deno?: { env?: { get(name: string): string | undefined } };
  };
  return g.process?.env?.[name] ?? g.Deno?.env?.get(name) ?? undefined;
}

/** Build the client from server environment variables. Throws if SARVAM_API_KEY is missing. */
export function createSarvamClientFromEnv(overrides: Partial<SarvamClientOptions> = {}): SarvamClient {
  const timeout = readEnv('SARVAM_TIMEOUT_MS');
  return new SarvamClient({
    apiKey: readEnv('SARVAM_API_KEY') ?? '',
    baseUrl: readEnv('SARVAM_BASE_URL') || undefined,
    chatModel: readEnv('SARVAM_CHAT_MODEL') || undefined,
    timeoutMs: timeout ? Number(timeout) : undefined,
    ...overrides,
  });
}
