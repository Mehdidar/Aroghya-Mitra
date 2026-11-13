import { useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';

export type SliderProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  /** Spoken value, e.g. "200 g". */
  valueText: string;
  testID?: string;
};

/** Dependency-free slider (drag or tap the track). Mirrors in RTL; adjustable for screen readers. */
export function Slider({ value, min, max, step, onChange, accessibilityLabel, valueText, testID }: SliderProps) {
  const t = useTheme();
  const { isRTL } = useLanguage();
  const [width, setWidth] = useState(0);
  const frac = max > min ? (value - min) / (max - min) : 0;
  const thumb = 28;

  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  const fromEvent = (e: GestureResponderEvent) => {
    if (!width) return;
    let f = Math.min(1, Math.max(0, e.nativeEvent.locationX / width));
    if (isRTL) f = 1 - f;
    set(min + f * (max - min));
  };

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value, text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === 'increment' ? step : -step))}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={fromEvent}
      onResponderMove={fromEvent}
      style={{ height: t.sizes.touchMin, justifyContent: 'center' }}>
      <View pointerEvents="none" style={{ height: 8, borderRadius: t.radii.full, backgroundColor: t.colors.chart.progressTrack }}>
        <View style={{ position: 'absolute', start: 0, top: 0, bottom: 0, width: `${frac * 100}%`, borderRadius: t.radii.full, backgroundColor: t.colors.chart.progressFill }} />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          start: Math.max(0, frac * width - thumb / 2),
          width: thumb,
          height: thumb,
          borderRadius: thumb,
          backgroundColor: t.colors.surface,
          borderWidth: 2,
          borderColor: t.colors.primary,
          boxShadow: t.shadows.raised.boxShadow,
        }}
      />
    </View>
  );
}
