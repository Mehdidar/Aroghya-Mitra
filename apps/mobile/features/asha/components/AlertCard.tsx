import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../shared/theme';
import { Icon, Text } from '../../shared/ui';
import { t } from '../data/i18n';
import { localizeAlert } from '../logic/rules';
import type { Lang, RiskAlert } from '../types';
import { Button, RiskBadge, useAshaColors } from './ui';

export function AlertCard({
  alert,
  lang,
  patientName,
  onAck,
  onRefer,
  onOpen,
  compact,
}: {
  alert: Pick<RiskAlert, 'severity' | 'reasonKey' | 'reasonParams' | 'source' | 'acknowledged'> & Partial<RiskAlert>;
  lang: Lang;
  patientName?: string;
  onAck?: () => void;
  onRefer?: () => void;
  onOpen?: () => void;
  /** Inside another card: muted fill, no shadow. */
  compact?: boolean;
}) {
  const theme = useTheme();
  const c = useAshaColors().risk[alert.severity];
  return (
    <View
      style={{
        backgroundColor: compact ? theme.colors.surfaceMuted : theme.colors.surface,
        borderRadius: compact ? theme.radii.md : theme.radii.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderStartWidth: 4,
        borderStartColor: c.bar,
        boxShadow: compact ? undefined : theme.shadows.card.boxShadow,
        padding: theme.layout.cardPadding,
        gap: theme.space[2],
        opacity: alert.acknowledged ? 0.75 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space[2] }}>
        <RiskBadge level={alert.severity} label={t(`risk.${alert.severity}`, lang)} style={{ alignSelf: 'center' }} />
        {patientName ? (
          <Pressable
            accessibilityRole="link"
            onPress={onOpen}
            hitSlop={theme.sizes.hitSlop}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1], minHeight: theme.sizes.touchMin, flexShrink: 1 }}
          >
            <Text variant="label" tone="accent" numberOfLines={1} style={{ flexShrink: 1 }}>
              {patientName}
            </Text>
            <Icon name="chevron-forward" size={theme.sizes.icon.sm} color={theme.accent.accentIcon} flipInRTL />
          </Pressable>
        ) : null}
      </View>
      <Text variant="bodySmall">{localizeAlert(alert as RiskAlert, lang)}</Text>
      <Text variant="caption" tone="tertiary">
        {alert.source}
      </Text>
      {onAck || onRefer ? (
        // Side by side when both labels fit, stacked full width otherwise (no truncated labels).
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2], marginTop: theme.space[1] }}>
          {onRefer ? (
            <Button title={t('patient.refer', lang)} onPress={onRefer} variant="danger" icon="paper-plane" style={{ flexGrow: 1, minHeight: theme.sizes.button.md, paddingHorizontal: theme.space[4] }} />
          ) : null}
          {onAck ? (
            <Button
              title={alert.acknowledged ? t('alerts.acked', lang) : t('alerts.ack', lang)}
              onPress={onAck}
              disabled={alert.acknowledged}
              variant="secondary"
              icon="checkmark"
              style={{ flexGrow: 1, minHeight: theme.sizes.button.md, paddingHorizontal: theme.space[4] }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
