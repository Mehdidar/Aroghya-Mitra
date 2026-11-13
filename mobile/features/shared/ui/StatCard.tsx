import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { useTheme } from '@/features/shared/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type StatCardProps = {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
  icon?: IconName;
  /** Mini chart at the bottom: 'ecg' line, 'bars' (rounded bars over ghost bars), or none. */
  chart?: 'ecg' | 'bars' | 'none';
  /** Values 0..1 for the bars chart. */
  data?: readonly number[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const ECG = 'M0 22 L18 22 L24 14 L30 22 L40 22 L46 4 L52 34 L58 22 L74 22 L80 16 L86 22 L100 22 L106 6 L112 32 L118 22 L140 22';

/** Big bold number with a small unit ("96 bpm", "62 kg") and a minimal chart. */
export function StatCard({ label, value, unit, caption, icon, chart = 'none', data = [0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.5], style, testID }: StatCardProps) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}${caption ? `, ${caption}` : ''}`}
      style={[
        {
          flex: 1,
          minWidth: 140,
          backgroundColor: t.colors.surface,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: t.colors.border,
          padding: t.layout.cardPadding,
          gap: t.space[1],
          boxShadow: t.shadows.card.boxShadow,
        },
        style,
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space[2] }}>
        {icon ? <Icon name={icon} size={t.sizes.icon.sm} color={t.accent.accentIcon} /> : null}
        <Text variant="caption" tone="secondary" style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.space[1] }}>
        <Text variant="h1" weight="bold" numeric>
          {value}
        </Text>
        {unit ? (
          <Text variant="statUnit" tone="secondary">
            {unit}
          </Text>
        ) : null}
      </View>
      {caption ? (
        <Text variant="caption" tone="tertiary">
          {caption}
        </Text>
      ) : null}
      {chart !== 'none' ? (
        // Charts never mirror in RTL.
        <View style={{ direction: 'ltr', marginTop: t.space[2] }}>
          <Svg width="100%" height={36} viewBox="0 0 140 36" preserveAspectRatio="none">
            {chart === 'ecg' ? (
              <Path d={ECG} stroke={t.colors.chart.ecg} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            ) : (
              data.map((v, i) => {
                const w = 140 / data.length;
                const h = Math.max(4, v * 36);
                return (
                  <Rect key={i} x={i * w + w * 0.2} width={w * 0.6} y={36 - h} height={h} rx={3} fill={i === data.length - 1 ? t.colors.chart.bars2 : t.colors.chart.barGhost} />
                );
              })
            )}
          </Svg>
        </View>
      ) : null}
    </View>
  );
}
