import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearPhraseCache, streamChatReply, type ChatDeps, type ChatEvent } from '../chat/chatService.ts';
import { KNOWLEDGE_BASE } from '../chat/knowledge.ts';
import { KnowledgeIndex } from '../chat/retrieval.ts';
import { trimHistory } from '../chat/prompt.ts';
import { ChatHistoryStore, MAX_STORED_MESSAGES, type KeyValueStorage } from '../../../features/patient-ai/chat/historyStore.ts';
import type { ChatMessage } from '../../speech/types.ts';

async function collect(gen: AsyncGenerator<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

function fakeDeps(reply: string[] | Error = ['ORS ', 'helps.']) {
  const prompts: ChatMessage[][] = [];
  const translations: string[] = [];
  const deps: ChatDeps = {
    async *chatStream(req) {
      prompts.push(req.messages);
      if (reply instanceof Error) throw reply;
      for (const r of reply) yield r;
    },
    translate: async (text, from, to) => {
      translations.push(`${from}>${to}:${text}`);
      if (from === 'hi' && to === 'en') return text.includes('दस्त') ? 'I have diarrhoea what should I do' : 'I have chest pain';
      return text.split('\n').map((line) => `[${to}] ${line}`).join('\n');
    },
  };
  return { deps, prompts, translations };
}

describe('KnowledgeIndex', () => {
  const index = new KnowledgeIndex(KNOWLEDGE_BASE);
  it('finds the right approved document', () => {
    assert.equal(index.search('my child has loose motions, how to make ORS')[0].doc.id, 'diarrhoea-ors');
    assert.equal(index.search('platelets low after mosquito fever')[0].doc.id, 'dengue');
    assert.equal(index.search('cough for 3 weeks and weight loss')[0].doc.id, 'tuberculosis');
    assert.equal(index.search('बीपी कैसे कम करें')[0].doc.id, 'hypertension'); // Hindi keyword, no translation
  });
  it('finds content in every main language without translation, including suffixed words', () => {
    const fever: Record<string, string> = {
      ta: 'எனக்கு காய்ச்சல் இருக்கிறது', bn: 'আমার জ্বর হয়েছে', te: 'నాకు జ్వరం ఉంది', mr: 'मला ताप आला आहे',
      gu: 'મને તાવ છે', kn: 'ನನಗೆ ಜ್ವರ ಇದೆ', ml: 'എനിക്ക് പനിയുണ്ട്', pa: 'ਮੈਨੂੰ ਬੁਖਾਰ ਹੈ', ur: 'مجھے بخار ہے', od: 'ମୋର ଜ୍ୱର ହୋଇଛି',
    };
    for (const [lang, q] of Object.entries(fever)) {
      assert.deepEqual(index.search(q).map((h) => h.doc.id), ['fever-care'], lang);
    }
    assert.equal(index.search('মাঝে মাঝে পাতলা পায়খানা')[0].doc.id, 'diarrhoea-ors');
  });

  it('returns nothing for unrelated text', () => {
    assert.deepEqual(index.search('who won the cricket match yesterday'), []);
  });
});

describe('streamChatReply', () => {
  it('streams a grounded reply with sources and chips', async () => {
    const { deps, prompts } = fakeDeps();
    const events = await collect(streamChatReply({ message: 'How do I make ORS at home?', history: [], language: 'en' }, deps));
    assert.deepEqual(events.map((e) => e.type), ['sources', 'delta', 'delta', 'chips', 'done']);
    const sources = events[0] as Extract<ChatEvent, { type: 'sources' }>;
    assert.equal(sources.sources[0].id, 'diarrhoea-ors');
    assert.match(prompts[0][0].content, /Reply in English/);
    assert.match(prompts[0][0].content, /6 level teaspoons of sugar/);
    const chips = events[3] as Extract<ChatEvent, { type: 'chips' }>;
    assert.ok(chips.chips.length > 0 && chips.chips.length <= 3);
  });

  it('skips query translation when the original text already finds content', async () => {
    const { deps, translations } = fakeDeps();
    await collect(streamChatReply({ message: 'मुझे दस्त हो रहे हैं', history: [], language: 'hi' }, deps));
    assert.ok(!translations.some((t) => t.startsWith('hi>en:')));
  });

  it('translates the query when local search finds nothing, and translates chips back', async () => {
    const { deps, prompts, translations } = fakeDeps();
    const events = await collect(streamChatReply({ message: 'मेरे पेट में मरोड़ और पतला मल', history: [], language: 'hi' }, {
      ...deps,
      translate: async (text, from, to, o) => (from === 'hi' ? 'I have diarrhoea' : deps.translate!(text, from, to, o)),
    }));
    assert.equal((events[0] as Extract<ChatEvent, { type: 'sources' }>).sources[0].id, 'diarrhoea-ors');
    void translations;
    assert.match(prompts[0][0].content, /Reply in Hindi/);
    const chips = events.find((e) => e.type === 'chips') as Extract<ChatEvent, { type: 'chips' }>;
    assert.ok(chips.chips.every((c) => c.startsWith('[hi]')));
  });

  it('drops weak extra sources', () => {
    const hits = new KnowledgeIndex(KNOWLEDGE_BASE).search('What should I eat if I have high BP?');
    assert.deepEqual(hits.map((h) => h.doc.id), ['hypertension']);
  });

  it('answers emergencies without calling the AI or translating the query first', async () => {
    const { deps, prompts, translations } = fakeDeps();
    const events = await collect(streamChatReply({ message: 'सांप ने काट लिया है', history: [], language: 'hi' }, deps));
    assert.equal(prompts.length, 0);
    assert.ok(translations.every((t) => t.startsWith('en>hi:'))); // only the steps are translated
    assert.equal(events[0].type, 'emergency');
  });

  it('caches translated emergency steps', async () => {
    clearPhraseCache();
    const { deps, translations } = fakeDeps();
    await collect(streamChatReply({ message: 'सांप ने काट लिया है', history: [], language: 'hi' }, deps));
    const firstCount = translations.length;
    await collect(streamChatReply({ message: 'सांप ने काट लिया है', history: [], language: 'hi' }, deps));
    assert.ok(firstCount > 0);
    assert.equal(translations.length, firstCount);
  });

  it('returns first-aid steps for an English emergency', async () => {
    const { deps, prompts } = fakeDeps();
    const events = await collect(streamChatReply({ message: 'a snake bit my brother', history: [], language: 'en' }, deps));
    assert.equal(prompts.length, 0);
    assert.deepEqual(events.map((e) => e.type), ['emergency', 'done']);
    const em = events[0] as Extract<ChatEvent, { type: 'emergency' }>;
    assert.deepEqual(em.categories, ['snakebite']);
    assert.equal(em.contacts[0].number, '108');
    assert.ok(em.steps.includes('Do not cut the bite.'));
  });

  it('catches emergencies through translation for languages without local terms', async () => {
    const { deps, prompts } = fakeDeps();
    const events = await collect(streamChatReply({ message: 'ବୁକୁ ଯନ୍ତ୍ରଣା', history: [], language: 'od' }, { ...deps, translate: async () => 'I have chest pain' }));
    assert.equal(events[0].type, 'emergency');
    assert.equal(prompts.length, 0);
  });

  it('reports a retryable error when the model fails, and when it returns nothing', async () => {
    const failing = await collect(streamChatReply({ message: 'fever care', history: [], language: 'en' }, fakeDeps(new Error('socket hang up')).deps));
    assert.deepEqual(failing.at(-1), { type: 'error', message: 'socket hang up', retryable: true });
    const empty = await collect(streamChatReply({ message: 'fever care', history: [], language: 'en' }, fakeDeps([]).deps));
    assert.equal(empty.at(-1)!.type, 'error');
  });

  it('keeps working when translation is down', async () => {
    const { deps } = fakeDeps();
    const events = await collect(streamChatReply({ message: 'बुखार में क्या करें', history: [], language: 'hi' }, { ...deps, translate: async () => { throw new Error('down'); } }));
    assert.equal(events.at(-1)!.type, 'done');
    const sources = events[0] as Extract<ChatEvent, { type: 'sources' }>;
    assert.equal(sources.sources[0].id, 'fever-care'); // matched on the Hindi keyword
  });

  it('uses the short spoken style in voice mode', async () => {
    const { deps, prompts } = fakeDeps();
    await collect(streamChatReply({ message: 'fever care', history: [], language: 'en', mode: 'voice' }, deps));
    assert.match(prompts[0][0].content, /spoken aloud/);
  });
});

describe('trimHistory', () => {
  it('keeps the newest turns within the budget', () => {
    const h = Array.from({ length: 20 }, (_, i) => ({ role: 'user' as const, content: `m${i}`.padEnd(100, '.') }));
    const t = trimHistory(h, 450, 12);
    assert.equal(t.length, 4);
    assert.equal(t.at(-1)!.content.startsWith('m19'), true);
  });
});

describe('ChatHistoryStore', () => {
  const memory = (): KeyValueStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => void data.set(k, v), removeItem: async (k) => void data.delete(k) };
  };
  const msg = (i: number) => ({ id: `m${i}`, role: 'user' as const, content: `hello ${i}`, createdAt: new Date(0).toISOString() });

  it('appends, caps and clears', async () => {
    const store = new ChatHistoryStore(memory());
    await store.append(msg(1), msg(2));
    assert.equal((await store.load()).length, 2);
    await store.append(...Array.from({ length: MAX_STORED_MESSAGES }, (_, i) => msg(i + 3)));
    const all = await store.load();
    assert.equal(all.length, MAX_STORED_MESSAGES);
    assert.equal(all.at(-1)!.id, `m${MAX_STORED_MESSAGES + 2}`);
    await store.clear();
    assert.deepEqual(await store.load(), []);
  });

  it('survives corrupt storage', async () => {
    const s = memory();
    s.data.set('patient-ai/chat-history/v1', '{not json');
    assert.deepEqual(await new ChatHistoryStore(s).load(), []);
  });
});
