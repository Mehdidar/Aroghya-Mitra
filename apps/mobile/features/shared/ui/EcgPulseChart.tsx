import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export type EcgPulseChartProps = {
  width?: number | string;
  height?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Clean ECG pulse line chart as seen in Image 1 (Report screen).
 * Renders an authentic clinical heartbeat waveform with P-Q-R-S-T waves.
 */
export function EcgPulseChart({
  width = '100%',
  height = 54,
  color = '#26A69A',
  strokeWidth = 2.5,
  style,
}: EcgPulseChartProps) {
  // Realistic multi-cycle ECG waveform path
  const pathData =
    'M 0,27 L 18,27 L 24,24 L 28,27 L 34,27 L 38,32 L 44,6 L 49,46 L 54,27 L 60,27 L 66,20 L 74,27 L 88,27 L 94,27 L 100,24 L 104,27 L 110,27 L 114,32 L 120,6 L 125,46 L 130,27 L 136,27 L 142,20 L 150,27 L 164,27 L 170,27 L 176,24 L 180,27 L 186,27 L 190,32 L 196,6 L 201,46 L 206,27 L 212,27 L 218,20 L 226,27 L 240,27';

  return (
    <View style={[{ direction: 'ltr', width: width as number, height }, style]}>
      <Svg width="100%" height={height} viewBox="0 0 240 54" preserveAspectRatio="none">
        <Path
          d={pathData}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

