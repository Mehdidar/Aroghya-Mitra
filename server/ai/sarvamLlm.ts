import type { SarvamClient } from '../speech/sarvamClient.ts';
import type { LlmCall } from './extractStructured.ts';

/** Adapter: Sarvam chat as an LlmCall for extractStructured. Low temperature for extraction. */
export function sarvamLlm(client: SarvamClient, opts: { model?: string; temperature?: number; maxTokens?: number } = {}): LlmCall {
  return async (messages, { signal }) => {
    const r = await client.chat(
      { messages, model: opts.model, temperature: opts.temperature ?? 0.1, maxTokens: opts.maxTokens ?? 2048 },
      { signal },
    );
    return r.content;
  };
}
