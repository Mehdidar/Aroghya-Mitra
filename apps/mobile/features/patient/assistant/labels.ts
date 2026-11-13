/**
 * Text for the personalised-reply UI: the "based on" labels and the safety
 * warnings, in the app language (assistant.json), falling back to the server's
 * translated text for a warning code the app does not know yet.
 */
import type { TFunction } from 'i18next';

import type { ChatWarning, ContextLabel, ReplyContext } from '@/features/patient/chat/types';

/** Labels never shown in the chip (age alone is not worth a mention). */
const HIDDEN: ContextLabel[] = ['age'];

export function contextLabels(t: TFunction, ctx: ReplyContext): string[] {
  return ctx.used
    .filter((l) => !HIDDEN.includes(l))
    .map((l) => (l === 'pregnancy' && ctx.pregnancyWeeks ? t('assistant:label.pregnancyWeeks', { weeks: ctx.pregnancyWeeks }) : t(`assistant:label.${l}`, { defaultValue: '' })))
    .filter(Boolean);
}

export function whyLine(t: TFunction, label: ContextLabel, ctx: ReplyContext): string {
  if (label === 'pregnancy' && ctx.pregnancyWeeks) return t('assistant:why.pregnancyWeeks', { weeks: ctx.pregnancyWeeks });
  return t(`assistant:why.${label}`, { defaultValue: '' });
}

export function warningText(t: TFunction, w: ChatWarning): string {
  const params = w.params ?? {};
  const key = w.code === 'dose_change' && !params.item ? 'assistant:warning.dose_change_any' : `assistant:warning.${w.code}`;
  return t(key, { ...params, defaultValue: w.text });
}
