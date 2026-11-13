import type { ReactNode } from 'react';
import { Platform, TextInput, View, type TextInputProps } from 'react-native';

import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';

import { Text, fontFor } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Shown before the input, e.g. "+91". */
  prefix?: string;
  error?: string;
  hint?: string;
  /** Phone numbers and codes: Latin digits, left-to-right even in Urdu. */
  numeric?: boolean;
  trailing?: ReactNode;
};

/** Labelled input with the same font and direction rules as <Text>. */
export function TextField({ label, prefix, error, hint, numeric, trailing, ...input }: TextFieldProps) {
  const t = useTheme();
  const { meta } = useLanguage();
  const { maxFontSizeMultiplier, ...font } = fontFor('title', numeric ? 'latn' : meta.script, 'semibold', t.textScale);
  return (
    <View style={{ gap: t.space[2] }}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[2],
          minHeight: t.sizes.button.lg,
          paddingHorizontal: t.space[4],
          borderRadius: t.radii.md,
          backgroundColor: t.colors.surface,
          borderWidth: error ? 2 : 1,
          borderColor: error ? t.colors.danger : t.colors.secondaryBorder,
          direction: numeric ? 'ltr' : undefined,
        }}>
        {prefix ? (
          <Text variant="title" weight="semibold" tone="secondary" numeric>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={t.colors.textTertiary}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          {...input}
          style={[
            font,
            { flex: 1, color: t.colors.textPrimary, paddingVertical: t.space[3], letterSpacing: numeric ? 1 : 0 },
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          ]}
        />
        {trailing}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
