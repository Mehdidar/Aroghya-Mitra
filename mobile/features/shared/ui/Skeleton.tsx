import { useEffect, useRef } from 'react';
import { Animated, Platform, type DimensionValue } from 'react-native';

import { useTheme } from '@/features/shared/theme';

/** Pulsing placeholder block for loading states. */
export function Skeleton({ width = '100%', height = 16, radius }: { width?: DimensionValue; height?: number; radius?: number }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: t.motion.duration.skeletonPulse / 2, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(v, { toValue: 0.5, duration: t.motion.duration.skeletonPulse / 2, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v, t.motion.duration.skeletonPulse]);
  return <Animated.View accessibilityElementsHidden style={{ width, height, borderRadius: radius ?? t.radii.xs, backgroundColor: t.colors.surfaceSunken, opacity: v }} />;
}
