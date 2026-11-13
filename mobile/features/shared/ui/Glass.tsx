import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/features/shared/theme';

export type GlassProps = {
  children?: ReactNode;
  /** 'light' over pale gradients; 'dark' over immersive/dark gradients. */
  variant?: 'light' | 'dark';
  intensity?: number;
  radius?: 'md' | 'lg' | 'xl' | 'xxl' | 'full';
  style?: StyleProp<ViewStyle>;
};

/**
 * Frosted glass. Only over a gradient or hero background, never over dense content.
 * iOS/web: real blur behind a translucent fill. Android: translucent fill only (no blur; cheap
 * phones). High contrast: solid. Text contrast is computed against the fill, never the blur.
 */
export function Glass({ children, variant = 'light', intensity = 30, radius = 'xl', style }: GlassProps) {
  const t = useTheme();
  const dark = variant === 'dark';
  const fill = t.glass === 'solid' ? (dark ? t.colors.surfaceInverse : t.colors.surface) : dark ? t.colors.glassFillOnDark : t.colors.glassFill;
  const frame: ViewStyle = {
    borderRadius: t.radii[radius],
    borderWidth: 1,
    borderColor: dark ? t.colors.glassBorderOnDark : t.colors.glassBorder,
    overflow: 'hidden',
  };
  return (
    <View style={[frame, style]}>
      {t.glass === 'blur' ? <BlurView intensity={intensity} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      {children}
    </View>
  );
}
