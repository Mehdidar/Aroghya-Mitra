/**
 * The text model the copilot uses: Gemini (GEMINI_API_KEY) first, Sarvam chat
 * (SARVAM_API_KEY) as backup. Server only; keys never reach the app.
 * Returns null when neither is configured, so routes can say so honestly.
 */
import type { LlmCall, LlmMessage } from '../ai/extractStructured.ts';
import { geminiConfigured, geminiGenerateWithModel } from '../ai/gemini.ts';
import { sarvamLlm } from '../ai/sarvamLlm.ts';
import { createSarvamClientFromEnv, readEnv } from '../speech/config.ts';

export type CopilotLlm = { call: LlmCall; name: () => string };

function flatten(messages: LlmMessage[]): { system: string; user: string } {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system');
  const user = rest.length === 1 ? rest[0].content : rest.map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}:\n${m.content}`).join('\n\n');
  return { system, user };
}

export function defaultCopilotLlm(opts: { json?: boolean } = {}): CopilotLlm | null {
  const gemini = geminiConfigured();
  const sarvam = Boolean(readEnv('SARVAM_API_KEY'));
  if (!gemini && !sarvam) return null;
  let last = 'none';
  const sarvamCall = sarvam ? sarvamLlm(createSarvamClientFromEnv(), { temperature: 0.1, maxTokens: 2048 }) : null;
  const call: LlmCall = async (messages, { signal }) => {
    if (gemini) {
      try {
        const r = await geminiGenerateWithModel(flatten(messages), null, { json: opts.json, temperature: 0.1, timeoutMs: 45_000 });
        last = r.model;
        return r.text;
      } catch (e) {
        if (!sarvamCall) throw e;
        console.warn('[copilot] Gemini failed, trying Sarvam:', (e as Error).message);
      }
    }
    const text = await sarvamCall!(messages, { signal });
    last = 'sarvam';
    return text;
  };
  return { call, name: () => last };
}
