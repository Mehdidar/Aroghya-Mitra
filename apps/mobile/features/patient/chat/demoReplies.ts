/**
 * Shown ONLY when the server cannot be reached. Every reply is labelled as a
 * demo answer in the UI; none of this text is presented as model output.
 * Keys are i18n keys in patient.json (chat.demo.*) so the reply follows the app language.
 */
const TABLE: { test: RegExp; key: string }[] = [
  { test: /fever|bukhar|ಜ್ವರ|बुखार|جوار|காய்ச்சல்|జ్వరం/i, key: 'fever' },
  { test: /headache|sar ?dard|सिर ?दर्द|ತಲೆನೋವು|سر ?درد|தலைவலி|తలనొప్పి/i, key: 'headache' },
  { test: /bp|blood pressure|pressure|रक्तचाप|ಬಿಪಿ|بلڈ پریشر/i, key: 'bp' },
  { test: /cough|khansi|खांसी|ಕೆಮ್ಮು|کھانسی|இருமல்|దగ్గు/i, key: 'cough' },
  { test: /pregnan|garbh|गर्भ|ಗರ್ಭ|حمل|கர்ப்ப|గర్భ/i, key: 'pregnancy' },
  { test: /medicine|tablet|dawa|दवा|ಔಷಧ|دوا|மருந்து|మందు/i, key: 'medicine' },
];

export function demoReplyKey(message: string): string {
  return TABLE.find((r) => r.test.test(message))?.key ?? 'general';
}

export const DEMO_CHIP_KEYS = ['fever', 'headache', 'bp', 'cough'] as const;
