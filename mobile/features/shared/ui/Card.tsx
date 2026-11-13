import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/features/shared/theme';

export type CardProps = {
  children: ReactNode;
  /** 'surface' white card with hairline border; 'muted'; 'inverse' dark navy (AI banners); 'accent' role tint. */
  tone?: 'surface' | 'muted' | 'inverse' | 'accent';
  padding?: 'md' | 'lg';
  radius?: 'lg' | 'xl' | 'xxl';
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Solid card for dense content (lists, records, the doctor module). */
export function Card({ children, tone = 'surface', padding = 'md', radius = 'lg', onPress, accessibilityLabel, style, testID }: CardProps) {
  const t = useTheme();
  const toneStyle: ViewStyle =
    tone === 'inverse'
      ? { backgroundColor: t.colors.surfaceInverse, backgroundImage: t.gradient([t.colors.surfaceInverse, t.colors.surfaceInverseRaised], undefined, '135deg') }
      : tone === 'muted'
        ? { backgroundColor: t.colors.surfaceMuted, borderWidth: 1, borderColor: t.colors.border }
        : tone === 'accent'
          ? { backgroundColor: t.accent.accentSoft, borderWidth: 1, borderColor: t.highContrast ? t.accent.accentBorder : 'transparent' }
          : { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border, boxShadow: t.shadows.card.boxShadow };
  const base: StyleProp<ViewStyle> = [
    { borderRadius: t.radii[radius], padding: padding === 'lg' ? t.layout.cardPaddingLg : t.layout.cardPadding, gap: t.space[3] },
    toneStyle,
    style,
  ];
  if (!onPress) return <View style={base} testID={testID}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [base, pressed && { transform: [{ scale: t.motion.pressScale }] }]}>
      {children}
    </Pressable>
  );
}
