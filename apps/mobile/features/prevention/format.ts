/** Plain-language text for plan items and flags (prevent namespace). Vaccine labels stay Latin in every language. */
import type { TFunction } from 'i18next';

import type { PlanFlag, PlanItem, PlanStatus } from '@am/patient-ai/prevention/index';

import type { PillTone } from '@/features/shared/ui';

export const STATUS_TONE: Record<PlanStatus, PillTone> = { overdue: 'danger', due: 'warning', ongoing: 'info', upcoming: 'neutral', done: 'success', missed: 'neutral' };
export const STATUS_ORDER: PlanStatus[] = ['overdue', 'due', 'ongoing', 'upcoming', 'missed', 'done'];

export function formatDay(day: string | null | undefined, bcp47: string): string {
  if (!day) return '';
  try {
    return new Date(`${day}T00:00:00`).toLocaleDateString(bcp47, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return day;
  }
}

export function itemTitle(t: TFunction, item: PlanItem): string {
  if (item.category === 'vaccine' && item.label) return item.label;
  return t(`prevent:item.${item.code}`, { n: item.dose ?? '' });
}

export function itemReason(t: TFunction, item: PlanItem, bcp47: string): string {
  const p = item.reason.params ?? {};
  const params: Record<string, string | number> = { ...p };
  for (const k of ['until', 'edd', 'next'] as const) if (typeof p[k] === 'string') params[k] = formatDay(p[k] as string, bcp47);
  const main = t(`prevent:reason.${item.reason.code}`, params);
  return p.selfReported ? `${main} ${t('prevent:reason.selfReported')}` : main;
}

/** The date line under an item: depends on its status. */
export function itemWhen(t: TFunction, item: PlanItem, bcp47: string): string {
  const d = (x: string | null | undefined) => formatDay(x, bcp47);
  switch (item.status) {
    case 'done':
      return item.doneOn ? t('prevent:when.doneOn', { date: d(item.doneOn) }) + (item.dueFrom && item.dueFrom > (item.doneOn ?? '') && item.category !== 'vaccine' && !item.id.startsWith('anc:') ? ` · ${t('prevent:when.nextOn', { date: d(item.dueFrom) })}` : '') : '';
    case 'overdue':
      return t('prevent:when.overdueSince', { date: d(item.dueBy) });
    case 'due':
      return item.dueBy ? t('prevent:when.dueBy', { date: d(item.dueBy) }) : '';
    case 'upcoming':
      return item.dueFrom ? t('prevent:when.from', { date: d(item.dueFrom) }) : '';
    case 'ongoing':
      return item.dueBy ? t('prevent:when.until', { date: d(item.dueBy) }) : item.dueFrom ? t('prevent:when.nextOn', { date: d(item.dueFrom) }) : '';
    case 'missed':
      return t('prevent:when.closed', { date: d(item.lastDay) });
  }
}

export function flagText(t: TFunction, f: PlanFlag, bcp47: string): string {
  const p: Record<string, string | number> = { ...(f.params ?? {}) };
  for (const k of ['since', 'on', 'edd'] as const) if (typeof p[k] === 'string') p[k] = formatDay(p[k] as string, bcp47);
  if (typeof p.severity === 'string') p.severity = t(`prevent:severity.${p.severity}`);
  if (typeof p.kind === 'string') p.kind = t(`prevent:screenKind.${p.kind}`);
  return t(`prevent:flag.${f.code}`, p);
}
