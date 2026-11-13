import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/features/shared/theme';

/**
 * The onboarding hero: a glossy "glass medical cross" built only from layered translucent rounded
 * Views (no image). Layers, back to front: a soft halo glow, a tinted depth copy offset down-end, the
 * frosted cross body with a gradient, then white highlights. Decorative: hidden from screen readers.
 */
export function GlassCross({ size = 200 }: { size?: number }) {
  const t = useTheme();
  const arm = size * 0.36;
  const r = arm * 0.34;
  const orb = t.accent.orb;
  const body = t.highContrast
    ? t.accent.accentSoft
    : `linear-gradient(145deg, ${orb.core} 0%, ${orb.mid} 55%, ${orb.outer} 100%)`;

  const bar = (w: number, h: number) => ({
    position: 'absolute' as const,
    width: w,
    height: h,
    borderRadius: r,
    start: (size - w) / 2,
    top: (size - h) / 2,
  });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size * 1.3, height: size * 1.3, alignItems: 'center', justifyContent: 'center' }}>
      {/* Halo */}
      <View
        style={{
          position: 'absolute',
          width: size * 0.9,
          height: size * 0.9,
          borderRadius: size,
          backgroundColor: orb.halo,
          boxShadow: `0px 0px ${Math.round(size * 0.35)}px ${Math.round(size * 0.12)}px ${orb.halo}`,
        }}
      />
      <View style={{ width: size, height: size, transform: [{ rotate: '-10deg' }] }}>
        {/* Depth copy */}
        <View style={{ position: 'absolute', width: size, height: size, top: arm * 0.16, start: arm * 0.12, opacity: 0.55 }}>
          <View style={[bar(arm, size), { backgroundColor: orb.outer }]} />
          <View style={[bar(size, arm), { backgroundColor: orb.outer }]} />
        </View>
        {/* Body */}
        <View style={[bar(arm, size), { backgroundColor: orb.mid, backgroundImage: body, borderWidth: 1.5, borderColor: t.colors.glassBorder }]} />
        <View style={[bar(size, arm), { backgroundColor: orb.mid, backgroundImage: body, borderWidth: 1.5, borderColor: t.colors.glassBorder }]} />
        {/* Centre joint: hides the inner borders so it reads as one piece of glass */}
        <View style={[bar(arm - 3, arm - 3), { borderRadius: 2, backgroundColor: orb.mid, backgroundImage: body }]} />
        {/* Highlights */}
        <View
          style={{
            position: 'absolute',
            width: arm * 0.22,
            height: size * 0.36,
            borderRadius: arm,
            start: (size - arm) / 2 + arm * 0.18,
            top: size * 0.06,
            backgroundColor: t.colors.glassFillStrong,
            opacity: 0.85,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: size * 0.3,
            height: arm * 0.18,
            borderRadius: arm,
            start: size * 0.06,
            top: (size - arm) / 2 + arm * 0.16,
            backgroundColor: t.colors.glassFillStrong,
            opacity: 0.7,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: arm * 0.5,
            height: arm * 0.5,
            borderRadius: arm,
            start: size / 2 - arm * 0.05,
            top: size / 2 - arm * 0.45,
            backgroundColor: t.colors.glassFill,
          }}
        />
      </View>
    </View>
  );
}

/** Glowing glass orb (AI moments). Colour follows the role accent. Decorative. */
export function GlowOrb({ size = 96, children }: { size?: number; children?: ReactNode }) {
  const t = useTheme();
  const o = t.accent.orb;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: o.mid,
        backgroundImage: t.highContrast ? undefined : `radial-gradient(circle at 35% 30%, ${o.core} 0%, ${o.mid} 45%, ${o.outer} 100%)`,
        boxShadow: `0px 0px ${Math.round(size * 0.45)}px ${Math.round(size * 0.1)}px ${o.halo}`,
      }}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.12,
          start: size * 0.22,
          width: size * 0.3,
          height: size * 0.16,
          borderRadius: size,
          backgroundColor: t.colors.glassFillStrong,
          opacity: 0.8,
          transform: [{ rotate: '-20deg' }],
        }}
      />
      {children}
    </View>
  );
}
