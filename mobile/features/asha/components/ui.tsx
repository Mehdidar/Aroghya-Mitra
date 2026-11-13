// P3's ASHA UI kit, now a thin layer over P1's shared design system (features/shared/theme + ui).
// Every export keeps its old name and props so the ASHA screens did not have to change shape;
// colours come from useTheme() (ASHA sage accent + semantic status tokens), never from hex literals.
import React, { createContext, useContext, useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useLanguage } from '../../shared/i18n/useLanguage';
import { useTheme, type Theme } from '../../shared/theme';
import {
  Card as SharedCard,
  Icon,
  Pill,
  PrimaryButton,
  Screen as SharedScreen,
  SecondaryButton,
  Text,
  fontFor,
  type IconName,
  type PillTone,
} from '../../shared/ui';
import type { RiskLevel } from '../types';

type RiskColors = { bg: string; fg: string; bar: string };

/** Semantic status tone (shared Pill) for each ASHA risk level. */
export const RISK_TONE: Record<RiskLevel, PillTone> = {
  none: 'success',
  low: 'info',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

/** Icon shown with every risk pill so colour is never the only signal. */
export const RISK_ICON: Record<RiskLevel, IconName> = {
  none: 'checkmark-circle',
  low: 'information-circle',
  medium: 'alert-circle',
  high: 'warning',
  critical: 'warning',
};

function ashaColors(t: Theme) {
  const s = t.colors.status;
  const risk = (level: RiskLevel): RiskColors => {
    const tone = s[RISK_TONE[level] as 'success' | 'info' | 'warning' | 'danger'];
    // critical is the darkest bar so it stands apart from high.
    return { bg: tone.bg, fg: tone.fg, bar: level === 'critical' ? tone.fg : tone.solid };
  };
  return {
    bg: t.colors.page,
    card: t.colors.surface,
    text: t.colors.textPrimary,
    muted: t.colors.textSecondary,
    border: t.colors.border,
    primary: t.accent.accent,
    primaryText: t.accent.onAccent,
    accentText: t.accent.accentText,
    danger: t.colors.danger,
    chip: t.colors.surface,
    risk: {
      none: risk('none'),
      low: risk('low'),
      medium: risk('medium'),
      high: risk('high'),
      critical: risk('critical'),
    } as Record<RiskLevel, RiskColors>,
  };
}

export type AshaColors = ReturnType<typeof ashaColors>;

/** The old `colors` object, derived from the theme (sage accent, high contrast aware). */
export function useAshaColors(): AshaColors {
  const t = useTheme();
  return useMemo(() => ashaColors(t), [t]);
}

/**
 * Page wrapper for ASHA screens that sit under the light stack header: shared Screen with the
 * header already covering the top inset, 20 px sides, 16 px gaps and an optional sticky footer.
 */
export function Screen({ children, scroll = true, footer, testID }: { children: React.ReactNode; scroll?: boolean; footer?: React.ReactNode; testID?: string }) {
  const t = useTheme();
  return (
    <SharedScreen scroll={scroll} footer={footer} testID={testID} contentStyle={{ paddingTop: t.space[4], gap: t.space[4] }}>
      {children}
    </SharedScreen>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <SharedCard style={style}>{children}</SharedCard>;
}

/** Section title inside a card. */
export function H({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="title" accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text variant="bodySmall" tone="secondary" style={style}>
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  icon,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: IconName;
  testID?: string;
}) {
  const t = useTheme();
  if (variant === 'primary') {
    return <PrimaryButton label={title} onPress={onPress} disabled={disabled} loading={loading} icon={icon} style={style} testID={testID} />;
  }
  if (variant === 'secondary' && !loading) {
    return <SecondaryButton label={title} onPress={onPress} disabled={disabled} icon={icon} style={style} testID={testID} />;
  }
  // Danger (and a busy secondary): same pill geometry as the shared buttons.
  const danger = variant === 'danger';
  const fg = danger ? t.colors.onDanger : t.colors.onSecondary;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={onPress}
      disabled={off}
      testID={testID}
      style={({ pressed }) => [
        {
          minHeight: t.sizes.button.lg,
          borderRadius: t.radii.full,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.space[2],
          paddingHorizontal: t.space[5],
          backgroundColor: danger ? t.colors.status.danger.solid : t.colors.secondary,
          borderWidth: danger ? 0 : 1,
          borderColor: t.colors.secondaryBorder,
          opacity: disabled ? 0.6 : 1,
          transform: [{ scale: pressed ? t.motion.pressScale : 1 }],
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={t.sizes.icon.sm} color={fg} /> : null}
      <Text variant="label" color={fg} align="center" style={{ flexShrink: 1 }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, tone }: { label: string; selected?: boolean; onPress?: () => void; tone?: 'danger' }) {
  const t = useTheme();
  const selBg = tone === 'danger' ? t.colors.status.danger.solid : t.colors.chipActive;
  const selFg = tone === 'danger' ? t.colors.status.onSolid : t.colors.onChipActive;
  return (
    <Pressable
      accessibilityRole={onPress ? 'checkbox' : undefined}
      accessibilityState={{ checked: !!selected }}
      onPress={onPress}
      hitSlop={t.sizes.hitSlop / 2}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[1],
        minHeight: t.sizes.touchMin,
        paddingHorizontal: t.space[4],
        borderRadius: t.radii.full,
        backgroundColor: selected ? selBg : t.colors.surface,
        borderWidth: 1,
        borderColor: selected ? selBg : t.colors.border,
        transform: [{ scale: pressed ? t.motion.pressScale : 1 }],
      })}
    >
      {selected ? <Icon name="checkmark" size={t.sizes.icon.xs} color={selFg} /> : null}
      <Text variant="label" color={selected ? selFg : t.colors.onChipInactive}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] }}>{children}</View>;
}

/** Single horizontally scrolling row of chips, bleeding to the screen edges. */
export function ChipScroll({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -t.layout.screenPaddingX, flexGrow: 0 }}
      contentContainerStyle={{ gap: t.space[2], paddingHorizontal: t.layout.screenPaddingX }}
    >
      {children}
    </ScrollView>
  );
}

export function RiskBadge({ level, label, style }: { level: RiskLevel; label: string; style?: StyleProp<ViewStyle> }) {
  return <Pill label={label} tone={RISK_TONE[level]} variant={level === 'critical' ? 'solid' : 'tinted'} icon={RISK_ICON[level]} style={style} />;
}

/** True inside <Row>: fields then share the row (and wrap below 140 px each). */
const InRow = createContext(false);

const NUMERIC_KEYBOARDS = new Set(['number-pad', 'decimal-pad', 'numeric', 'phone-pad']);

/** Labelled input with the shared TextField look; supports multiline and a boolean error. */
export function Field({ label, error, style, ...input }: TextInputProps & { label: string; error?: boolean }) {
  const t = useTheme();
  const { meta } = useLanguage();
  const inRow = useContext(InRow);
  const numeric = !!input.keyboardType && NUMERIC_KEYBOARDS.has(input.keyboardType);
  const { maxFontSizeMultiplier, ...font } = fontFor('body', numeric ? 'latn' : meta.script, 'semibold', t.textScale);
  return (
    <View style={[{ gap: t.space[2] }, inRow && { flexGrow: 1, flexBasis: 140 }, style as object]}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.colors.textTertiary}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        {...input}
        style={[
          font,
          {
            minHeight: input.multiline ? 96 : t.sizes.button.lg,
            paddingHorizontal: t.space[4],
            paddingVertical: t.space[3],
            borderRadius: t.radii.md,
            backgroundColor: t.colors.surface,
            borderWidth: error ? 2 : 1,
            borderColor: error ? t.colors.danger : t.colors.secondaryBorder,
            color: t.colors.textPrimary,
          },
          input.multiline && { textAlignVertical: 'top' },
          numeric && { writingDirection: 'ltr' },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
      />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }, style]}>
      <InRow.Provider value>{children}</InRow.Provider>
    </View>
  );
}
