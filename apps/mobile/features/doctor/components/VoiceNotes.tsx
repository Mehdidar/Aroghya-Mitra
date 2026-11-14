import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { LANGUAGES, type LanguageCode } from '@am/shared';
import type { ConsultationNoteDraft } from '@server/copilot/notesSchema';

import { useVoiceInput } from '@/features/patient/voice/useVoiceInput';
import { useSession } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Card, Icon, PrimaryButton, SecondaryButton, Text, TextField } from '@/features/shared/ui';

import { draftNotes } from '../copilot/api';
import { Chip } from './Chip';

/**
 * Copilot feature D: the doctor dictates (any app language), the server's STT
 * transcribes (/speech/stt, file sent with filePart via useVoiceInput), the
 * transcript can be corrected, and the server drafts a structured note. The
 * draft only pre-fills the form below; nothing is saved here.
 */
export function VoiceNotes({ patientId, onDraft }: { patientId: string; onDraft: (d: ConsultationNoteDraft) => void }) {
  const { t } = useTranslation('copilot');
  const th = useTheme();
  const appLang = useSession((s) => s.language);
  const [lang, setLang] = useState<LanguageCode>(appLang);
  const voice = useVoiceInput(lang);
  const [transcript, setTranscript] = useState('');
  const [state, setState] = useState<'idle' | 'drafting' | 'error' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const record = () =>
    voice.state === 'recording'
      ? void voice.stop()
      : void voice.start((tr) => {
          if (tr.text) setTranscript((x) => (x.trim() ? `${x.trim()} ${tr.text}` : tr.text));
        });

  const draft = async () => {
    setError(null);
    setState('drafting');
    try {
      const r = await draftNotes(transcript.trim(), patientId, lang);
      onDraft(r.draft);
      setState('done');
    } catch (e) {
      const reason = (e as { body?: { reason?: string } }).body?.reason;
      setError(reason === 'no_model' ? t('notes.noModel') : reason === 'unparseable' ? t('notes.unparseable') : t('notes.needServer'));
      setState('error');
    }
  };

  const recording = voice.state === 'recording';
  return (
    <Card radius="xl" padding="lg" testID="voice-notes">
      <View style={{ gap: th.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space[2] }}>
          <Icon name="mic-outline" size={th.sizes.icon.sm} color={th.accent.accentIcon} />
          <Text variant="title" style={{ flex: 1 }}>
            {t('notes.title')}
          </Text>
        </View>
        <Text variant="bodySmall" tone="secondary">
          {t('notes.body')}
        </Text>
        <Text variant="label">{t('notes.language')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
          {(Object.keys(LANGUAGES) as LanguageCode[]).map((code) => (
            <Chip key={code} label={LANGUAGES[code].native} selected={lang === code} onPress={() => setLang(code)} accessibilityLabel={LANGUAGES[code].english} testID={`notes-lang-${code}`} />
          ))}
        </View>
        <PrimaryButton
          label={recording ? t('notes.stop', { s: voice.seconds, max: voice.maxSeconds }) : voice.state === 'transcribing' ? t('notes.transcribing') : transcript ? t('notes.recordMore') : t('notes.record')}
          icon={recording ? 'stop-circle-outline' : 'mic'}
          loading={voice.state === 'transcribing'}
          onPress={record}
          testID="notes-record"
        />
        {voice.error ? (
          <Text tone="danger" variant="bodySmall" accessibilityLiveRegion="polite">
            {voice.error.kind === 'permission' ? t('notes.micPermission') : t('notes.sttFailed')}
          </Text>
        ) : null}
        <TextField label={t('notes.transcript')} value={transcript} onChangeText={setTranscript} multiline numberOfLines={5} placeholder={t('notes.transcriptHint')} testID="notes-transcript" />
        <SecondaryButton label={state === 'drafting' ? t('notes.drafting') : t('notes.draft')} icon="sparkles-outline" disabled={transcript.trim().length < 3 || state === 'drafting'} onPress={draft} testID="notes-draft" />
        {state === 'done' ? (
          <Text variant="bodySmall" tone="secondary" accessibilityLiveRegion="polite" testID="notes-drafted">
            {t('notes.drafted')}
          </Text>
        ) : null}
        {error ? (
          <Text tone="danger" variant="bodySmall" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
