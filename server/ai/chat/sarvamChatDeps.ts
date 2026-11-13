import type { SarvamClient } from '../../speech/sarvamClient.ts';
import { LANGUAGE_CAPABILITIES, translateModelFor } from '../../speech/languageCapabilities.ts';
import type { ChatDeps } from './chatService.ts';

/** Wire the chat service to Sarvam: sarvam-105b-conversations for replies, Mayura / Sarvam-Translate for MT. */
export function sarvamChatDeps(client: SarvamClient): ChatDeps {
  return {
    chatStream: (req, opts) => client.chatStream(req, opts),
    translate: async (text, from, to, opts) => {
      const r = await client.translate(
        {
          input: text,
          sourceLanguageCode: LANGUAGE_CAPABILITIES[from].sarvamCode,
          targetLanguageCode: LANGUAGE_CAPABILITIES[to].sarvamCode,
          model: translateModelFor(from, to),
        },
        { signal: opts.signal, timeoutMs: 8000 },
      );
      return r.translatedText;
    },
  };
}
