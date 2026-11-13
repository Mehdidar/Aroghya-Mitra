import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APP_LANGUAGES, LANGUAGE_CAPABILITIES, fromSarvamCode, translateModelFor, ttsStrategy } from '../languageCapabilities.ts';
import { SentenceStream, splitSentences, splitText } from '../textChunks.ts';
import { parseWav, pcm16BytesFor } from '../wav.ts';

describe('languageCapabilities', () => {
  it('has no Bulbul voice for Urdu or Kashmiri', () => {
    assert.equal(LANGUAGE_CAPABILITIES.ur.bulbulTts, false);
    assert.equal(LANGUAGE_CAPABILITIES.ks.bulbulTts, false);
    assert.equal(ttsStrategy('ur'), 'device');
    assert.equal(ttsStrategy('ur', { deviceHasVoice: false }), 'text-only');
    assert.equal(ttsStrategy('ks'), 'text-only');
  });

  it('falls back to device speech when Sarvam is unreachable', () => {
    assert.equal(ttsStrategy('hi'), 'bulbul');
    assert.equal(ttsStrategy('hi', { sarvamReachable: false }), 'device');
  });

  it('picks sarvam-translate for languages mayura lacks', () => {
    assert.equal(translateModelFor('en', 'hi'), 'mayura:v1');
    assert.equal(translateModelFor('en', 'ur'), 'sarvam-translate:v1');
    assert.equal(translateModelFor('ks', 'en'), 'sarvam-translate:v1');
  });

  it('uses or-IN for Odia on the realtime socket and maps both codes back', () => {
    assert.equal(LANGUAGE_CAPABILITIES.od.realtimeSttCode, 'or-IN');
    assert.equal(fromSarvamCode('od-IN'), 'od');
    assert.equal(fromSarvamCode('or-IN'), 'od');
    assert.equal(fromSarvamCode('xx-IN'), null);
  });

  it('marks Urdu and Kashmiri right-to-left', () => {
    const rtl = APP_LANGUAGES.filter((l) => LANGUAGE_CAPABILITIES[l].dir === 'rtl');
    assert.deepEqual(rtl.sort(), ['ks', 'ur']);
  });
});

describe('textChunks', () => {
  it('splits on Latin, Devanagari and Urdu sentence ends', () => {
    assert.deepEqual(splitSentences('Hello there. How are you? Fine!'), ['Hello there.', 'How are you?', 'Fine!']);
    assert.deepEqual(splitSentences('बुखार है। पानी पिएं।'), ['बुखार है।', 'पानी पिएं।']);
    assert.deepEqual(splitSentences('آرام کریں۔ پانی پیئیں۔'), ['آرام کریں۔', 'پانی پیئیں۔']);
  });

  it('packs sentences under the limit and hard-splits long ones', () => {
    assert.deepEqual(splitText('aaa bbb. ccc ddd. eee.', 10), ['aaa bbb.', 'ccc ddd.', 'eee.']);
    for (const c of splitText('word '.repeat(100), 25)) assert.ok(c.length <= 25);
  });

  it('emits complete sentences from a token stream', () => {
    const s = new SentenceStream();
    assert.deepEqual(s.push('Drink ORS'), []);
    assert.deepEqual(s.push('. Rest well'), ['Drink ORS.']);
    assert.deepEqual(s.push('। Call'), ['Rest well।']);
    assert.deepEqual(s.flush(), ['Call']);
  });
});

describe('wav', () => {
  it('finds the PCM data chunk', () => {
    const pcm = new Uint8Array([1, 2, 3, 4]);
    const header = new Uint8Array(44);
    const v = new DataView(header.buffer);
    header.set(new TextEncoder().encode('RIFF'), 0);
    v.setUint32(4, 36 + pcm.length, true);
    header.set(new TextEncoder().encode('WAVEfmt '), 8);
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true);
    v.setUint16(34, 16, true);
    header.set(new TextEncoder().encode('data'), 36);
    v.setUint32(40, pcm.length, true);
    const info = parseWav(new Uint8Array([...header, ...pcm]));
    assert.equal(info.sampleRate, 16000);
    assert.equal(info.channels, 1);
    assert.deepEqual([...info.pcm], [1, 2, 3, 4]);
    assert.equal(pcm16BytesFor(100, 16000), 3200);
  });
});
