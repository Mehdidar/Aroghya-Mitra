import { useEffect, useRef } from 'react';
import { Animated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/features/shared/theme';

import { GlowingMedicalOrb } from './GlowingMedicalOrb';

export type VoiceOrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type VoiceOrbProps = {
  state: VoiceOrbState;
  /** Microphone or playback level, 0..1. Drives the halo so the orb reacts to the voice. */
  level?: number;
  size?: number;
  onPress?: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The voice assistant's orb: the glowing medical orb with an audio-reactive halo.
 * `level` (RMS 0..1 from the recorder, or a synthetic envelope during playback) scales
 * the outer ring; `state` sets the breathing rhythm. One 48 px+ tap target.
 */
export function VoiceOrb({ state, level = 0, size = 180, onPress, accessibilityLabel, style, testID }: VoiceOrbProps) {
  const t = useTheme();
  const halo = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(halo, { toValue: Math.min(1, Math.max(0, level)), useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }, [level, halo]);

  useEffect(() => {
    if (state !== 'thinking') {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1600, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [state, spin]);

  const ringScale = halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [state === 'idle' ? 0 : 0.25, 0.6] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const haloColor = state === 'speaking' ? t.accent.accent : state === 'listening' ? t.colors.status.danger.solid : t.accent.accentBorder;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: state === 'thinking' }}
      testID={testID}
      style={[{ width: size * 1.4, height: size * 1.4, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size * 1.15,
          height: size * 1.15,
          borderRadius: size,
          backgroundColor: haloColor,
          opacity: ringOpacity,
          transform: [{ scale: ringScale }],
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size * 1.25,
          height: size * 1.25,
          borderRadius: size,
          borderWidth: 3,
          borderColor: haloColor,
          borderStyle: 'dashed',
          opacity: state === 'thinking' ? 0.7 : 0,
          transform: [{ rotate }],
        }}
      />
      <View pointerEvents="none">
        <GlowingMedicalOrb size={size} variant="voice" pulse={state !== 'idle'} />
      </View>
    </Pressable>
  );
}
