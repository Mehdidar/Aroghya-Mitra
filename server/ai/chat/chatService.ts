/**
 * Chat orchestration (server side). Emits events the app renders as they arrive:
 *
 *   emergency → (first-aid steps)            no AI call at all
 *   sources → delta* → chips → done          normal reply, streamed
 *   error                                     with a retryable flag
 *
 * Personalised (the request carried a patientId or food preferences):
 *
 *   [generic red flag]  emergency → done                       unchanged, checked first
 *   context → warning* → emergency → done                      a personal rule escalated (pregnancy + high BP signs)
 *   context → warning* → sources → delta* → chips → done       tailored reply
 *
 * `context.used` lists which parts of the record informed the answer;
 * `personalised` is false (with `reason`) when the record could not be used.
 *
 * The phone runs the same red-flag check first for an instant banner; the server
 * repeats it (plus a translated English check for languages without term lists).
 */
import { detectRedFlags, EMERGENCY_CONTACTS, type EmergencyContact, type RedFlagCategory } from '../../../packages/patient-ai/safety/redFlags.ts';
import { LANGUAGE_CAPABILITIES, type AppLanguage } from '../../speech/languageCapabilities.ts';
import { SarvamError } from '../../speech/errors.ts';
import type { ChatMessage } from '../../speech/types.ts';
import { KNOWLEDGE_BASE, type KnowledgeDoc } from './knowledge.ts';
import { chatSystemPrompt, trimHistory } from './prompt.ts';
import { KnowledgeIndex } from './retrieval.ts';
import { relevantLabels, type ContextLabel, type PatientContextResult } from './patientContext.ts';
import { checkPersonalSafety, type PersonalWarning, type WarningCode } from './personalSafety.ts';

export type ChatEvent =
  | { type: 'emergency'; categories: RedFlagCategory[]; contacts: EmergencyContact[]; steps: string[]; sources: SourceRef[] }
  | { type: 'context'; used: ContextLabel[]; personalised: boolean; reason?: 'not_permitted' | 'no_patient' | 'unavailable'; pregnancyWeeks?: number }
  | { type: 'warning'; code: WarningCode; text: string; params: Record<string, string | number>; escalate: boolean }
  | { type: 'sources'; sources: SourceRef[] }
  | { type: 'delta'; text: string }
  | { type: 'chips'; chips: string[] }
  | { type: 'done' }
  | { type: 'error'; message: string; retryable: boolean };

export interface SourceRef {
  id: string;
  title: string;
  org: string;
  url: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequestInput {
  message: string;
  history: ChatTurn[];
  language: AppLanguage;
  mode?: 'text' | 'voice';
  /**
   * The patient's own record context. Called only after the generic red-flag
   * check, so emergencies never wait for the records store.
   */
  loadPatientContext?: () => Promise<PatientContextResult>;
}

export interface ChatDeps {
  chatStream(req: { messages: ChatMessage[]; temperature?: number; maxTokens?: number }, opts: { signal?: AbortSignal }): AsyncIterable<string>;
  /** Machine translation (Sarvam translate). Optional: without it, retrieval uses the raw text and emergency steps stay in English. */
  translate?(text: string, from: AppLanguage, to: AppLanguage, opts: { signal?: AbortSignal }): Promise<string>;
  index?: KnowledgeIndex;
}

/** Languages with no red-flag term list on the phone: translate to English and check again. */
const NO_LOCAL_TERMS: AppLanguage[] = ['od', 'as', 'ks'];

const DEFAULT_CHIPS = ['How do I make ORS at home?', 'When is a fever dangerous?', 'How can I lower my BP?'];

let defaultIndex: KnowledgeIndex | null = null;
const getDefaultIndex = () => (defaultIndex ??= new KnowledgeIndex(KNOWLEDGE_BASE));

const toRef = (d: KnowledgeDoc): SourceRef => ({ id: d.id, title: d.title, org: d.source.org, url: d.source.url });

export async function* streamChatReply(input: ChatRequestInput, deps: ChatDeps, opts: { signal?: AbortSignal } = {}): AsyncGenerator<ChatEvent> {
  const message = input.message.trim();
  if (!message) {
    yield { type: 'error', message: 'Empty message', retryable: false };
    return;
  }
  const lang = input.language;
  const index = deps.index ?? getDefaultIndex();

  // 1. Emergency on the original text: instant, no network.
  let flags = detectRedFlags(message);
  if (flags.isEmergency) {
    yield* emergencyEvents(flags.categories, flags.contacts, lang, deps, opts.signal);
    return;
  }

  // The patient's record (own record only, checked by the loader).
  const personal = input.loadPatientContext ? await input.loadPatientContext() : null;
  const ctx = personal?.context ?? null;
  // Personal rules have English (and a few Hindi) terms only.
  const personalRulesApply = !!ctx && (!!ctx.pregnancy || ctx.allergies.length > 0 || ctx.activeMedicines.length > 0 || ctx.conditions.length > 0);

  // Translate to English only when it is needed (it costs ~0.7-1 s):
  //  - the language has no local red-flag terms (second safety net), or
  //  - the original text finds nothing in the knowledge base, or
  //  - the patient's record could trigger a personal safety rule.
  let english = message;
  let hits = index.search(message, { limit: 3 });
  const needsEnglish = lang !== 'en' && deps.translate && (NO_LOCAL_TERMS.includes(lang) || hits.length === 0 || personalRulesApply);
  if (needsEnglish) {
    try {
      english = await deps.translate!(message, lang, 'en', opts);
      const second = detectRedFlags(english);
      if (second.isEmergency) flags = second;
      if (hits.length === 0) hits = index.search(english, { limit: 3 });
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      // Keep the original-text results.
    }
  }

  if (flags.isEmergency) {
    yield* emergencyEvents(flags.categories, flags.contacts, lang, deps, opts.signal);
    return;
  }

  // 2. Personal safety rules on the message + record, before the model.
  const warnings: PersonalWarning[] = checkPersonalSafety([message, english], ctx);
  if (personal) {
    const used = relevantLabels(english === message ? message : `${message} ${english}`, ctx, warnings.flatMap((w) => w.uses));
    yield {
      type: 'context',
      used,
      // Food preferences alone also personalise the answer.
      personalised: used.length > 0,
      ...(personal.status !== 'ok' ? { reason: personal.status } : {}),
      ...(ctx?.pregnancy && used.includes('pregnancy') ? { pregnancyWeeks: ctx.pregnancy.weeks } : {}),
    };
  }
  if (warnings.length) {
    const texts = await translateAll(warnings.map((w) => w.text), lang, deps, opts.signal);
    for (const [i, w] of warnings.entries()) yield { type: 'warning', code: w.code, text: texts[i], params: w.params, escalate: w.escalate };
  }
  if (warnings.some((w) => w.escalate)) {
    yield* emergencyEvents(['pregnancy'], [EMERGENCY_CONTACTS.ambulance], lang, deps, opts.signal);
    return;
  }

  // 3. Approved content found above.
  const docs = hits.map((h) => h.doc);
  yield { type: 'sources', sources: docs.map(toRef) };

  // 4. Stream the reply.
  const cap = LANGUAGE_CAPABILITIES[lang];
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: chatSystemPrompt(docs, {
        languageName: cap.englishName,
        mode: input.mode ?? 'text',
        patient: personal ? { status: personal.status, context: ctx, warnings } : undefined,
      }),
    },
    ...trimHistory(input.history).map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: message },
  ];
  let produced = false;
  try {
    for await (const delta of deps.chatStream({ messages, temperature: 0.3, maxTokens: input.mode === 'voice' ? 300 : 700 }, opts)) {
      produced = true;
      yield { type: 'delta', text: delta };
    }
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    const retryable = e instanceof SarvamError ? e.retryable || e.isServiceUnavailable : true;
    yield { type: 'error', message: e instanceof Error ? e.message : 'Chat failed', retryable };
    return;
  }
  if (!produced) {
    yield { type: 'error', message: 'The assistant returned an empty reply', retryable: true };
    return;
  }

  // 5. Suggestion chips from the retrieved content (no extra AI call).
  const chips = [...new Set(docs.flatMap((d) => d.followUps))].slice(0, 3);
  yield { type: 'chips', chips: await translateAll(chips.length ? chips : DEFAULT_CHIPS, lang, deps, opts.signal) };
  yield { type: 'done' };
}

async function* emergencyEvents(categories: RedFlagCategory[], contacts: EmergencyContact[], lang: AppLanguage, deps: ChatDeps, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const doc = KNOWLEDGE_BASE.find((d) => d.emergencyFor?.some((c) => categories.includes(c)));
  const steps = doc?.emergencySteps ?? ['Call 108 now, or go to the nearest hospital.'];
  yield {
    type: 'emergency',
    categories,
    contacts,
    steps: await translateAll(steps, lang, deps, signal),
    sources: doc ? [toRef(doc)] : [],
  };
  yield { type: 'done' };
}

/**
 * Emergency steps and chips are fixed strings, so their translations are cached:
 * after the first time, emergencies and chips cost no network round trip.
 */
const PHRASE_CACHE_LIMIT = 2000;
const phraseCache = new Map<string, string>();

export function clearPhraseCache(): void {
  phraseCache.clear();
}

async function translateAll(texts: string[], lang: AppLanguage, deps: ChatDeps, signal?: AbortSignal): Promise<string[]> {
  if (lang === 'en' || !deps.translate || texts.length === 0) return texts;
  try {
    // In parallel, one call per text: mayura:v1 merges newline-joined input into one line (checked 2026-11-13).
    return await Promise.all(
      texts.map(async (t) => {
        const key = `${lang}\u0000${t}`;
        const hit = phraseCache.get(key);
        if (hit) return hit;
        const translated = await deps.translate!(t, 'en', lang, { signal });
        if (phraseCache.size >= PHRASE_CACHE_LIMIT) phraseCache.delete(phraseCache.keys().next().value!);
        phraseCache.set(key, translated);
        return translated;
      }),
    );
  } catch (e) {
    if (signal?.aborted) throw e;
    return texts; // English is better than nothing, especially for emergency steps.
  }
}
