import { View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/features/shared/theme';

import { Text } from '@/features/shared/ui';

export type Bar = { label: string; value: number; secondary?: number };

/** Horizontal bars with the value printed, readable without colour. */
export function BarChart({ title, bars, unit = '', testID }: { title: string; bars: Bar[]; unit?: string; testID?: string }) {
  const t = useTheme();
  const max = Math.max(1, ...bars.map((b) => b.value));
  const rowH = 30;
  const labelW = 110;
  const width = 320;
  const height = Math.max(rowH, bars.length * rowH);
  return (
    <View accessible accessibilityLabel={`${title}. ${bars.map((b) => `${b.label}: ${b.value}${unit}`).join('. ')}`} testID={testID} style={{ gap: t.space[2] }}>
      <Text variant="label">{title}</Text>
      {bars.length === 0 ? (
        <Text variant="bodySmall" tone="secondary">
          —
        </Text>
      ) : (
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          {bars.map((b, i) => {
            const y = i * rowH;
            const w = ((width - labelW - 44) * b.value) / max;
            return (
              <G key={b.label}>
                <SvgText x={0} y={y + 19} fontSize={12} fill={t.colors.textSecondary}>
                  {b.label.length > 16 ? `${b.label.slice(0, 15)}…` : b.label}
                </SvgText>
                <Rect x={labelW} y={y + 6} width={width - labelW - 44} height={16} rx={8} fill={t.colors.chart.barGhost} />
                <Rect x={labelW} y={y + 6} width={Math.max(4, w)} height={16} rx={8} fill={t.accent.accent} />
                {b.secondary ? <Rect x={labelW} y={y + 6} width={Math.max(2, ((width - labelW - 44) * b.secondary) / max)} height={16} rx={8} fill={t.colors.status.danger.solid} /> : null}
                <SvgText x={width - 40} y={y + 19} fontSize={12} fill={t.colors.textPrimary}>
                  {`${b.value}${unit}`}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}
