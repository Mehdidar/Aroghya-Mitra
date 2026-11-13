/**
 * Live run of the chat service against Sarvam.
 *   SARVAM_API_KEY=... node server/ai/scripts/chatDemo.ts
 */
import { createSarvamClientFromEnv } from '../../speech/config.ts';
import { streamChatReply } from '../chat/chatService.ts';
import { sarvamChatDeps } from '../chat/sarvamChatDeps.ts';
import type { AppLanguage } from '../../speech/languageCapabilities.ts';

const CASES: { language: AppLanguage; message: string }[] = [
  { language: 'hi', message: 'मेरे बच्चे को दस्त हो रहे हैं, क्या करूं?' },
  { language: 'en', message: 'What should I eat if I have high BP?' },
  { language: 'hi', message: 'सांप ने काट लिया है' },
];

async function main() {
  const deps = sarvamChatDeps(createSarvamClientFromEnv());
  for (const c of CASES) {
    console.log(`\n=== [${c.language}] ${c.message}`);
    const t0 = performance.now();
    let first = -1;
    let reply = '';
    for await (const e of streamChatReply({ ...c, history: [] }, deps)) {
      const ms = Math.round(performance.now() - t0);
      if (e.type === 'delta') {
        if (first < 0) first = ms;
        reply += e.text;
      } else if (e.type === 'emergency') {
        console.log(`EMERGENCY at ${ms} ms: ${e.categories.join(', ')} → call ${e.contacts.map((x) => x.number).join(' / ')}`);
        e.steps.forEach((s) => console.log(`  • ${s}`));
      } else if (e.type === 'sources') {
        console.log(`sources at ${ms} ms: ${e.sources.map((s) => s.id).join(', ') || '(none)'}`);
      } else if (e.type === 'chips') {
        console.log(`reply (first token ${first} ms):\n${reply.trim()}\nchips: ${e.chips.join(' | ')}`);
      } else if (e.type === 'error') {
        console.log(`ERROR: ${e.message}`);
      } else if (e.type === 'done') {
        console.log(`done at ${ms} ms`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
