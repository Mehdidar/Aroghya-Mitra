import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import type { ChatWarning, ReplyContext } from '@/features/patient/chat/types';
import { useTheme } from '@/features/shared/theme';
import { Icon, Text } from '@/features/shared/ui';

import { contextLabels, warningText, whyLine } from './labels';

/**
 * Under a reply: "Personalised for you · based on: pregnancy 34 wks, your
 * medicines, allergy" and a "Why this answer?" disclosure listing each record
 * part used. When the record could not be used, a short note says so.
 * `tone="panel"` draws it on the dark voice panel.
 */
export function PersonalisedNote({ context, tone = 'default' }: { context: ReplyContext; tone?: 'default' | 'panel' }) {
  const { t } = useTranslation('assistant');
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const labels = contextLabels(t, context);
  const onPanel = tone === 'panel';
  const soft = onPanel ? 'rgba(255,255,255,0.82)' : undefined;

  if (!context.personalised || labels.length === 0) {
    if (!context.reason) return null;
    return (
      <Text variant="caption" tone={onPanel ? undefined : 'tertiary'} color={soft} testID="chat-not-personalised">
        {t('notPersonalised')}
      </Text>
    );
  }

  const chip = `${t('personalised')} · ${t('basedOn', { list: labels.join(', ') })}`;
  return (
    <View style={{ gap: theme.space[1], maxWidth: '100%' }} testID="chat-personalised">
      <View
        accessible
        accessibilityLabel={chip}
        style={{
          alignSelf: onPanel ? 'center' : 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[1],
          paddingHorizontal: theme.space[3],
          paddingVertical: theme.space[1],
          minHeight: theme.sizes.pill,
          borderRadius: theme.radii.full,
          backgroundColor: onPanel ? 'rgba(255,255,255,0.16)' : theme.accent.accentSoft,
          maxWidth: '100%',
        }}>
        <Icon name="person-circle-outline" size={theme.sizes.icon.sm} color={onPanel ? '#FFFFFF' : theme.accent.accentIcon} />
        <Text variant="caption" weight="semibold" color={onPanel ? '#FFFFFF' : theme.accent.accentSoftText} style={{ flexShrink: 1 }}>
          {chip}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? t('why.hide') : t('why.title')}
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        testID="chat-why"
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: onPanel ? 'center' : 'flex-start' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }}>
          <Icon name={open ? 'chevron-up' : 'help-circle-outline'} size={theme.sizes.icon.sm} color={soft ?? theme.colors.textSecondary} />
          <Text variant="caption" weight="semibold" tone={onPanel ? undefined : 'secondary'} color={soft}>
            {open ? t('why.hide') : t('why.title')}
          </Text>
        </View>
      </Pressable>
      {open ? (
        <View
          testID="chat-why-details"
          style={{ gap: theme.space[1], padding: theme.space[3], borderRadius: theme.radii.lg, backgroundColor: onPanel ? 'rgba(255,255,255,0.12)' : theme.colors.surfaceMuted }}>
          <Text variant="caption" tone={onPanel ? undefined : 'secondary'} color={soft}>
            {t('why.intro')}
          </Text>
          {context.used
            .map((l) => whyLine(t, l, context))
            .filter(Boolean)
            .map((line) => (
              <Text key={line} variant="caption" color={onPanel ? '#FFFFFF' : undefined}>
                {`• ${line}`}
              </Text>
            ))}
          <Text variant="caption" tone={onPanel ? undefined : 'tertiary'} color={soft}>
            {t('why.footer')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Safety warnings above a reply. Escalating ones (go to hospital / 108) are drawn in danger colours. */
export function WarningCards({ warnings }: { warnings: ChatWarning[] }) {
  const { t } = useTranslation('assistant');
  const theme = useTheme();
  if (!warnings.length) return null;
  return (
    <View style={{ gap: theme.space[2], width: '100%' }}>
      {warnings.map((w, i) => {
        const s = w.escalate ? theme.colors.status.danger : theme.colors.status.warning;
        return (
          <View
            key={`${w.code}-${i}`}
            accessibilityRole="alert"
            testID={`chat-warning-${w.code}`}
            style={{ flexDirection: 'row', gap: theme.space[2], padding: theme.space[3], borderRadius: theme.radii.lg, backgroundColor: s.bg, borderWidth: 1, borderColor: s.solid }}>
            <Icon name={w.escalate ? 'warning' : 'alert-circle'} size={theme.sizes.icon.md} color={s.icon} />
            <View style={{ flex: 1, gap: theme.space[1] }}>
              <Text variant="label" color={s.fg}>
                {t('warning.title')}
              </Text>
              <Text variant="bodySmall" color={s.fg}>
                {warningText(t, w)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
