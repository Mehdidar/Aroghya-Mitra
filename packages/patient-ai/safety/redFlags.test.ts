import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectRedFlags } from './redFlags.ts';

const flagged = (text: string) => detectRedFlags(text).categories;

describe('red flags: English', () => {
  it('detects core emergencies', () => {
    assert.deepEqual(flagged('My father has chest pain and is sweating'), ['cardiac']);
    assert.deepEqual(flagged("I can't breathe properly"), ['breathing']);
    assert.deepEqual(flagged('cant breathe'), ['breathing']);
    assert.deepEqual(flagged('Her face is drooping and speech is slurred'), ['stroke']);
    assert.deepEqual(flagged('He collapsed and is unresponsive'), ['unconscious']);
    assert.deepEqual(flagged('my son is having seizures'), ['seizure']);
    assert.deepEqual(flagged('the wound will not stop... bleeding heavily'), ['bleeding']);
    assert.deepEqual(flagged('a snake bit my brother'), ['snakebite']);
    assert.deepEqual(flagged('she drank pesticide'), ['poisoning']);
  });

  it('is case and whitespace insensitive', () => {
    assert.deepEqual(flagged('CHEST   PAIN'), ['cardiac']);
  });

  it('still triggers for "what to do if" help requests', () => {
    assert.deepEqual(flagged('What to do if someone has chest pain?'), ['cardiac']);
    assert.deepEqual(flagged('how do I know if I am having a heart attack'), ['cardiac']);
  });

  it('puts the mental-health helpline first for self-harm, and ignores negation there', () => {
    const r = detectRedFlags('I want to die');
    assert.deepEqual(r.categories, ['self_harm']);
    assert.deepEqual(r.contacts.map((c) => c.number), ['14416', '108', '112']);
    assert.deepEqual(flagged("I'm not suicidal, just asking"), ['self_harm']);
  });

  it('shows 108 then 112 for other emergencies', () => {
    assert.deepEqual(detectRedFlags('chest pain').contacts.map((c) => c.number), ['108', '112']);
  });
});

describe('red flags: Indian languages', () => {
  it('Hindi and Hinglish', () => {
    assert.deepEqual(flagged('मुझे सीने में दर्द हो रहा है'), ['cardiac']);
    assert.deepEqual(flagged('सांस नहीं आ रही है'), ['breathing']);
    assert.deepEqual(flagged('papa behosh ho gaye'), ['unconscious']);
    assert.deepEqual(flagged('mujhe seene me dard hai'), ['cardiac']);
    assert.deepEqual(flagged('सांप ने काट लिया'), ['snakebite']);
  });

  it('other scripts', () => {
    assert.deepEqual(flagged('سینے میں درد ہے'), ['cardiac']); // Urdu
    assert.deepEqual(flagged('বুকে ব্যথা করছে'), ['cardiac']); // Bengali
    assert.deepEqual(flagged('நெஞ்சு வலி அதிகமாக உள்ளது'), ['cardiac']); // Tamil
    assert.deepEqual(flagged('పాము కరిచింది'), ['snakebite']); // Telugu suffix
    assert.deepEqual(flagged('छातीत दुखतंय'), ['cardiac']); // Marathi suffix
    assert.deepEqual(flagged('ശ്വാസംമുട്ടൽ ഉണ്ട്'), ['breathing']); // Malayalam
    assert.deepEqual(flagged('ਛਾਤੀ ਵਿੱਚ ਦਰਦ ਹੈ'), ['cardiac']); // Punjabi
  });

  it('handles zero-width joiners', () => {
    assert.deepEqual(flagged('सीने में‍ दर्द'.replace('‍', '')), ['cardiac']);
    assert.deepEqual(flagged('बेहो‌श'), ['unconscious']);
  });
});

describe('red flags: false positives', () => {
  it('ignores negated symptoms', () => {
    assert.deepEqual(flagged('No chest pain, just a mild cough'), []);
    assert.deepEqual(flagged("I don't have difficulty breathing"), []);
    assert.deepEqual(flagged('सीने में दर्द नहीं है'), []);
    assert.deepEqual(flagged('நெஞ்சு வலி இல்லை'), []);
  });

  it('does NOT treat "will not stop" or "not going away" as negation', () => {
    assert.deepEqual(flagged('it will not stop, bleeding heavily'), ['bleeding']);
    assert.deepEqual(flagged('the chest pain is not going away'), ['cardiac']);
    assert.deepEqual(flagged('there are no signs of stroke'), []);
    assert.deepEqual(flagged('सीने में दर्द नहीं जा रहा'), ['cardiac']);
    assert.deepEqual(flagged('seene me dard nahi ja raha'), ['cardiac']);
  });

  it('ignores definition questions without first-person words', () => {
    assert.deepEqual(flagged('What is a heart attack?'), []);
    assert.deepEqual(flagged('Explain the symptoms of stroke'), []);
  });

  it('does not match inside other words', () => {
    assert.deepEqual(flagged('These shoes are a good fit'), []);
    assert.deepEqual(flagged('Poisonous plants list for my garden project'), []);
    assert.deepEqual(flagged('ಈ ವಿಷಯ ಬಗ್ಗೆ ಹೇಳಿ'), []); // Kannada "vishaya" = topic, not poison
    assert.deepEqual(flagged('এই বিষয়ে বলুন'), []); // Bengali "bishoy" = topic
    assert.deepEqual(flagged('മനസ്സിന് വിഷമം ഉണ്ട്'), []); // Malayalam "vishamam" = sadness
  });

  it('returns nothing for ordinary questions or empty input', () => {
    assert.deepEqual(flagged('I have a mild headache and a runny nose'), []);
    assert.deepEqual(flagged('मुझे हल्का बुखार है'), []);
    assert.deepEqual(flagged(''), []);
  });
});
