import { useEffect, useRef } from 'react';
import { Animated, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { useTheme } from '@/features/shared/theme';

export type GlowingMedicalOrbProps = {
  size?: number;
  variant?: 'capsule' | 'voice' | 'simple';
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * 3D Glowing Blue Medical Orb matching Image 4 (Symptom Checker) and Image 2 (Voice Call).
 * Features layered radial lighting, an inner medical capsule core, and soft pulsing breathing animation.
 */
export function GlowingMedicalOrb({
  size = 140,
  variant = 'capsule',
  pulse = true,
  style,
}: GlowingMedicalOrbProps) {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    if (pulse) {
      const breathing = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 1.05,
              duration: 1800,
              useNativeDriver: false,
            }),
            Animated.timing(scale, {
              toValue: 0.98,
              duration: 1800,
              useNativeDriver: false,
            }),
          ]),
          Animated.sequence([
            Animated.timing(glowOpacity, {
              toValue: 0.9,
              duration: 1800,
              useNativeDriver: false,
            }),
            Animated.timing(glowOpacity, {
              toValue: 0.5,
              duration: 1800,
              useNativeDriver: false,
            }),
          ]),
        ])
      );
      breathing.start();
      return () => breathing.stop();
    }
  }, [pulse, scale, glowOpacity]);

  const radius = size / 2;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      {/* Outer ambient blur halo */}
      <Animated.View
        style={{
          position: 'absolute',
          width: size * 1.3,
          height: size * 1.3,
          borderRadius: (size * 1.3) / 2,
          backgroundColor: 'rgba(56, 189, 248, 0.28)',
          boxShadow: `0px 0px ${Math.round(size * 0.55)}px ${Math.round(size * 0.2)}px rgba(56, 189, 248, 0.45)`,
          opacity: glowOpacity,
        }}
      />

      {/* Main glass sphere */}
      <Animated.View
        style={{
          width: size,
          height: size,
          transform: [{ scale }],
        }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Defs>
            {/* Outer sphere gradient */}
            <RadialGradient id="orbGlow" cx="40%" cy="35%" r="65%" fx="35%" fy="30%">
              <Stop offset="0%" stopColor="#E0F7FF" stopOpacity="0.95" />
              <Stop offset="25%" stopColor="#38BDF8" stopOpacity="0.85" />
              <Stop offset="65%" stopColor="#0284C7" stopOpacity="0.8" />
              <Stop offset="100%" stopColor="#034585" stopOpacity="0.95" />
            </RadialGradient>

            {/* Inner neon core */}
            <RadialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#67E8F9" stopOpacity="1" />
              <Stop offset="50%" stopColor="#0EA5E9" stopOpacity="0.8" />
              <Stop offset="100%" stopColor="#0369A1" stopOpacity="0" />
            </RadialGradient>

            {/* Capsule 3D gradient */}
            <LinearGradient id="capsuleGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#38BDF8" />
              <Stop offset="50%" stopColor="#0284C7" />
              <Stop offset="100%" stopColor="#0C4A6E" />
            </LinearGradient>

            {/* Gloss reflection gradient */}
            <LinearGradient id="glossGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
          </Defs>

          {/* Background Sphere */}
          <Circle cx={radius} cy={radius} r={radius - 4} fill="url(#orbGlow)" />

          {/* Inner pulsating energy aura */}
          <Circle cx={radius} cy={radius} r={radius * 0.65} fill="url(#coreGlow)" />

          {/* Capsule Variant (Image 4) */}
          {variant === 'capsule' && (
            <>
              {/* Outer glowing aura ring around the capsule */}
              <Circle
                cx={radius}
                cy={radius}
                r={radius * 0.42}
                fill="none"
                stroke="#67E8F9"
                strokeWidth={1.5}
                strokeDasharray="4, 3"
                opacity={0.7}
              />

              {/* Angled Medical Capsule */}
              <Rect
                x={radius - radius * 0.18}
                y={radius - radius * 0.42}
                width={radius * 0.36}
                height={radius * 0.84}
                rx={radius * 0.18}
                fill="url(#capsuleGrad)"
                transform={`rotate(-28 ${radius} ${radius})`}
                stroke="#BAE6FD"
                strokeWidth={1.2}
              />

              {/* Capsule center divider ring */}
              <Rect
                x={radius - radius * 0.18}
                y={radius - 1}
                width={radius * 0.36}
                height={2}
                fill="#E0F2FE"
                transform={`rotate(-28 ${radius} ${radius})`}
                opacity={0.9}
              />

              {/* Capsule glossy shine highlight */}
              <Rect
                x={radius - radius * 0.12}
                y={radius - radius * 0.36}
                width={radius * 0.08}
                height={radius * 0.34}
                rx={radius * 0.04}
                fill="#FFFFFF"
                transform={`rotate(-28 ${radius} ${radius})`}
                opacity={0.8}
              />
            </>
          )}

          {/* Glass specular curved highlight on top left */}
          <Circle
            cx={radius * 0.68}
            cy={radius * 0.52}
            r={radius * 0.28}
            fill="url(#glossGrad)"
            opacity={0.65}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
