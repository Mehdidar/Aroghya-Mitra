import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/features/shared/theme';

import { Icon, type IconName } from './Icon';

export type IconButtonProps = {
  icon: IconName;
  /** Required: icon buttons have no visible label, so screen readers need this. */
  accessibilityLabel: string;
  onPress?: () => void;
  /** 'soft' pale square (header), 'glass' white translucent circle (over gradients), 'dark' black. */
  variant?: 'soft' | 'glass' | 'dark';
  /** Small accent dot (e.g. unread notifications). */
  badge?: boolean;
  flipInRTL?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** 48 x 48 icon button (the references' 40 px raised to the 48 px touch minimum). */
export function IconButton({ icon, accessibilityLabel, onPress, variant = 'soft', badge, flipInRTL, style, testID }: IconButtonProps) {
  const t = useTheme();
  const bg = variant === 'dark' ? t.colors.primary : variant === 'glass' ? t.colors.glassFillStrong : t.colors.surfaceSunken;
  const fg = variant === 'dark' ? t.colors.onPrimary : t.colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      hitSlop={t.sizes.hitSlop}
      style={({ pressed }) => [
        {
          width: t.sizes.iconButton,
          height: t.sizes.iconButton,
          borderRadius: variant === 'glass' ? t.radii.full : t.radii.sm,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: t.highContrast || variant === 'glass' ? 1 : 0,
          borderColor: variant === 'glass' ? t.colors.glassBorder : t.colors.border,
          transform: [{ scale: pressed ? t.motion.pressScale : 1 }],
        },
        style,
      ]}>
      <Icon name={icon} color={fg} size={t.sizes.icon.md} flipInRTL={flipInRTL} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: 10,
            end: 11,
            width: 9,
            height: 9,
            borderRadius: t.radii.full,
            backgroundColor: t.accent.accent,
            borderWidth: 2,
            borderColor: bg,
          }}
        />
      ) : null}
    </Pressable>
  );
}
