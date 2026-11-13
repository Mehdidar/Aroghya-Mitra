/**
 * Streams one chat turn from POST /ai/chat (server/speech/http.ts).
 *   body: { message, history: [{role, content}], language, mode, patientId?, diet? }
 *   patientId: the signed-in patient's own record; the server personalises only if the caller owns it.
 *   response: text/event-stream of ChatEvent (features/patient/chat/types.ts)
 *
 * `fetch` from 'expo/fetch' streams the body on iOS and Android; on web the
 * global fetch streams. The caller passes a fetchImpl in tests.
 */
import { Platform } from 'react-native';

import { apiBaseUrl, authHeaders } from '@/features/shared/services/api';

import { readSse } from './sse';
import type { ChatEvent, ChatTurn } from './types';

/** Food preferences sent with each chat request (features/patient/assistant/preferences.ts). */
export interface ChatDiet {
  type?: 'veg' | 'nonveg' | 'vegan' | 'jain';
  noOnionGarlic?: boolean;
  avoid?: string[];
}

export class ChatUnavailableError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ChatUnavailableError';
  }
}

export interface StreamChatInput {
  message: string;
  history: ChatTurn[];
  language: string;
  mode?: 'text' | 'voice';
  patientId?: string | null;
  diet?: ChatDiet | null;
}

export interface StreamChatOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function defaultFetch(): typeof fetch {
  // expo/fetch is the streaming client on native; it is also fine on web, but Jest has no native module for it.
  if (Platform.OS === 'web' || process.env.JEST_WORKER_ID) return globalThis.fetch.bind(globalThis);
  // Lazy: expo/fetch binds a native module that Jest and the web build do not have.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('expo/fetch') as { fetch: typeof fetch }).fetch;
}

export async function* streamChat(input: StreamChatInput, opts: StreamChatOptions = {}): AsyncGenerator<ChatEvent> {
  const fetchImpl = opts.fetchImpl ?? defaultFetch();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
  opts.signal?.addEventListener('abort', () => ctrl.abort());
  let res: Response;
  try {
    res = await fetchImpl(`${apiBaseUrl()}/ai/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...authHeaders() },
      body: JSON.stringify({
        message: input.message,
        // The server reads { role, content } turns (server/speech/http.ts).
        history: input.history.map((h) => ({ role: h.role, content: h.text })),
        language: input.language,
        mode: input.mode ?? 'text',
        ...(input.patientId ? { patientId: input.patientId } : {}),
        ...(input.diet ? { diet: input.diet } : {}),
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new ChatUnavailableError(`Chat server unreachable: ${(e as Error).message}`);
  }
  if (!res.ok) {
    clearTimeout(timer);
    throw new ChatUnavailableError(`Chat server returned ${res.status}`, res.status);
  }
  try {
    for await (const data of readSse(res)) {
      let ev: ChatEvent;
      try {
        ev = JSON.parse(data) as ChatEvent;
      } catch {
        continue;
      }
      yield ev;
      if (ev.type === 'done' || ev.type === 'error') return;
    }
  } finally {
    clearTimeout(timer);
  }
}
