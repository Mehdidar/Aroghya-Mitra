// Patient-side voice input: records on the phone and transcribes through the server (POST /speech/stt).
// No Sarvam key ships in the app. The ASHA module has its own hook in features/asha/voice.
export { useVoiceInput as usePatientVoice, STT_MAX_SECONDS, transcribeFile } from '@/features/patient/voice/useVoiceInput';
/** Speech is always "configured": the server either transcribes or answers 503 and the screen explains. */
export const sttConfigured = () => true;
