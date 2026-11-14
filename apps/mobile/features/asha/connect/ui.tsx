/** Small building blocks shared by the ASHA connect screens (messages, thread, scan, today's plan). */
import React from 'react';
import { Pressable, View } from 'react-native';

import type { AshaMessage } from '@/features/ashaConnect/types';
import { useTheme } from '@/features/shared/theme';
import { Icon, Text, type IconName } from '@/features/shared/ui';

import { hasKey } from '../data/i18n';
import { formatDate } from '../logic/clinical';
import type { Lang } from '../types';
import { humanize } from './inbox';

export type T = (key: string, params?: Record<string, string | number>) => string;
type Tone = 'danger' | 'warning' | 'info' | 'success' | 'neutral';

/** "14/11/2026 · 09:30". Digits stay Latin (as everywhere in the ASHA module). */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${formatDate(iso)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Today", "Tomorrow" or "Mon 17/11": for the visit-day chips. */
export function dayLabel(offset: number, date: Date, lang: Lang, t: T): string {
  if (offset === 0) return t('thread.day.today');
  if (offset === 1) return t('thread.day.tomorrow');
  let wd = '';
  try {
    wd = date.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short' });
  } catch {
    wd = '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${wd ? `${wd} ` : ''}${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** The emergency categories of a patient's message in words ("breathing trouble, heavy bleeding"). */
export function urgentSigns(m: AshaMessage | null | undefined, t: T): string {
  const cats = m?.emergencyCategories ?? [];
  return cats.map((c) => (hasKey(`emcat.${c}`) ? t(`emcat.${c}`) : humanize(c).toLowerCase())).join(', ');
}

/** Label for a symptom code from a visit or a message: the ASHA symptom list first, then humanised. */
export function symptomLabel(code: string, t: T): string {
  if (hasKey(`sym.${code}`)) return t(`sym.${code}`);
  const fm = /^fetal_movement_(\w+)$/.exec(code);
  if (fm && hasKey(`fm.${fm[1]}`)) return `${t('visit.fetalMovement')}: ${t(`fm.${fm[1]}`)}`;
  const em = /^emergency_(\w+)$/.exec(code);
  if (em) return hasKey(`emcat.${em[1]}`) ? `${t('msg.urgent')}: ${t(`emcat.${em[1]}`)}` : `${t('msg.urgent')}: ${humanize(em[1]).toLowerCase()}`;
  return humanize(code);
}

/** A tinted notice with an icon (colour is never the only signal), optional actions below. */
export function Notice({ tone, icon, title, body, children, testID }: { tone: Tone; icon: IconName; title: string; body?: string; children?: React.ReactNode; testID?: string }) {
  const theme = useTheme();
  const s = theme.colors.status[tone];
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={{
        gap: theme.space[3],
        padding: theme.layout.cardPadding,
        borderRadius: theme.radii.xl,
        backgroundColor: s.bg,
        borderWidth: theme.highContrast ? 1 : 0,
        borderColor: s.solid,
      }}
    >
      <View accessible style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space[3] }}>
        <Icon name={icon} size={theme.sizes.icon.sm} color={s.icon} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" color={s.fg}>
            {title}
          </Text>
          {body ? (
            <Text variant="bodySmall" color={s.fg}>
              {body}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/** Tappable row used by Today's plan and the inbox: icon chip, two lines, chevron. */
export function ActionRow({
  icon,
  tone = 'neutral',
  title,
  subtitle,
  badge,
  onPress,
  testID,
}: {
  icon: IconName;
  tone?: Tone | 'accent';
  title: string;
  subtitle?: string;
  /** Count bubble: `text` is drawn, `a11y` is read ("3 new"). */
  badge?: { text: string; a11y: string };
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  const s = tone === 'accent' ? { bg: theme.accent.accentSoft, fg: theme.colors.textPrimary, icon: theme.accent.accentIcon, solid: theme.accent.accent } : theme.colors.status[tone];
  const strong = tone === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, badge?.a11y].filter(Boolean).join('. ')}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        minHeight: theme.sizes.touchMin + 16,
        padding: theme.space[3],
        borderRadius: theme.radii.lg,
        backgroundColor: strong ? s.bg : theme.colors.surface,
        borderWidth: strong && !theme.highContrast ? 0 : 1,
        borderColor: strong ? s.solid : theme.colors.border,
        borderStartWidth: 4,
        borderStartColor: s.solid,
        transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
      })}
    >
      <View style={{ width: theme.sizes.iconChip, height: theme.sizes.iconChip, borderRadius: theme.radii.sm, backgroundColor: s.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={theme.sizes.icon.sm} color={s.icon} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" color={strong ? s.fg : undefined}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color={strong ? s.fg : theme.colors.textSecondary} numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {badge ? <CountBadge label={badge.text} /> : null}
      <Icon name="chevron-forward" size={theme.sizes.icon.sm} color={theme.colors.textTertiary} flipInRTL />
    </Pressable>
  );
}

/** Solid count bubble ("3 new"). */
export function CountBadge({ label, testID }: { label: string; testID?: string }) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={{
        minWidth: 24,
        minHeight: 24,
        paddingHorizontal: theme.space[2],
        borderRadius: theme.radii.full,
        backgroundColor: theme.colors.status.danger.solid,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="caption" weight="bold" color={theme.colors.status.onSolid} numeric>
        {label}
      </Text>
    </View>
  );
}
