import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/features/shared/theme';
import { Text } from '@/features/shared/ui';

import type { VitalsSeries } from '@server/records/history';

/** One small line chart per vitals series: oldest to newest, with the latest value called out. */
export function VitalsChart({ series, width = 300, height = 96, testID }: { series: VitalsSeries; width?: number; height?: number; testID?: string }) {
  const t = useTheme();
  const pts = series.points;
  if (pts.length === 0) return null;
  const pad = { x: 8, top: 14, bottom: 18 };
  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = pts.length > 1 ? (width - pad.x * 2) / (pts.length - 1) : 0;
  const coords = pts.map((p, i) => ({ x: pad.x + i * stepX, y: pad.top + (1 - (p.value - min) / span) * (height - pad.top - pad.bottom) }));
  const last = coords[coords.length - 1];
  const latest = values[values.length - 1];
  return (
    <View testID={testID} accessible accessibilityLabel={`${series.label}: ${latest} ${series.unit}`} style={{ gap: t.space[1] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="label" tone="secondary">
          {series.label}
        </Text>
        <Text variant="bodyStrong" numeric>
          {`${latest} ${series.unit}`}
        </Text>
      </View>
      <Svg width={width} height={height}>
        <Line x1={pad.x} y1={height - pad.bottom} x2={width - pad.x} y2={height - pad.bottom} stroke={t.colors.chart.barGhost} strokeWidth={1} />
        <Polyline points={coords.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" stroke={t.colors.chart.line} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <Circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 5 : 3} fill={i === coords.length - 1 ? t.colors.chart.ecg : t.colors.chart.line} />
        ))}
        <SvgText x={pad.x} y={height - 4} fontSize={10} fill={t.colors.textTertiary}>
          {pts[0].at.slice(0, 10)}
        </SvgText>
        <SvgText x={last.x} y={height - 4} fontSize={10} fill={t.colors.textTertiary} textAnchor="end">
          {pts[pts.length - 1].at.slice(0, 10)}
        </SvgText>
      </Svg>
    </View>
  );
}
