/**
 * The big glowing blue panel used by the voice assistant (full screen) and the
 * home screen's "tap and speak" card: a soft sky-to-deep-blue gradient with a
 * light bloom near the top, like a call screen. High-contrast mode drops the
 * gradient for a solid colour with readable white text.
 */
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/features/shared/theme';

export const PANEL = {
  top: '#8FDCFB',
  mid: '#3A97EC',
  deep: '#1846B8',
  bottom: '#0E2E86',
  text: '#FFFFFF',
  textSoft: 'rgba(255, 255, 255, 0.88)',
  /** For text on the light sky at the top of the panel (white would be too faint there). */
  header: '#2C5FA8',
  chip: 'rgba(255, 255, 255, 0.18)',
  chipBorder: 'rgba(255, 255, 255, 0.38)',
};

export function VoicePanel({ children, radius = 40, style, testID }: { children: ReactNode; radius?: number; style?: StyleProp<ViewStyle>; testID?: string }) {
  const t = useTheme();
  const solid = t.highContrast;
  return (
    <View
      testID={testID}
      style={[
        {
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: solid ? '#0B3A8C' : PANEL.mid,
          backgroundImage: solid ? undefined : `linear-gradient(180deg, ${PANEL.top} 0%, ${PANEL.mid} 38%, ${PANEL.deep} 78%, ${PANEL.bottom} 100%)`,
          boxShadow: solid ? undefined : '0px 24px 48px -12px rgba(24, 70, 184, 0.45)',
        },
        style,
      ]}>
      {solid ? null : (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: '-20%',
            left: '-10%',
            right: '-10%',
            height: '70%',
            backgroundImage: 'radial-gradient(ellipse at 50% 40%, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 65%)',
          }}
        />
      )}
      {children}
    </View>
  );
}
