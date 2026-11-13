import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/features/shared/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  /** Trailing arrow chip (onboarding "Get Started →"). */
  trailingArrow?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityHint?: string;
};

/** Near-black full-width pill, 56 high: the one primary action of a screen. */
export function PrimaryButton({ label, onPress, icon, trailingArrow, disabled, loading, style, testID, accessibilityHint }: ButtonProps) {
  const t = useTheme();
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityHint={accessibilityHint}
      disabled={off}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        {
          minHeight: t.sizes.button.lg,
          borderRadius: t.radii.full,
          backgroundColor: off ? t.colors.primaryDisabled : pressed ? t.colors.primaryPressed : t.colors.primary,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.space[2],
          paddingHorizontal: t.space[6],
          boxShadow: off ? undefined : t.shadows.raised.boxShadow,
          transform: [{ scale: pressed ? t.motion.pressScale : 1 }],
        },
        style,
      ]}>
      {loading ? <ActivityIndicator color={t.colors.onPrimary} /> : icon ? <Icon name={icon} color={off ? t.colors.onPrimaryDisabled : t.colors.onPrimary} size={t.sizes.icon.sm} /> : null}
      <Text variant="label" color={off ? t.colors.onPrimaryDisabled : t.colors.onPrimary}>
        {label}
      </Text>
      {trailingArrow ? (
        <View
          style={{
            position: 'absolute',
            end: t.space[2],
            width: 40,
            height: 40,
            borderRadius: t.radii.full,
            backgroundColor: t.colors.primaryPressed,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="arrow-forward" color={t.colors.onPrimary} size={t.sizes.icon.sm} flipInRTL />
        </View>
      ) : null}
    </Pressable>
  );
}

/** White (or pale) secondary button with a hairline border. */
export function SecondaryButton({ label, onPress, icon, disabled, style, testID, accessibilityHint }: ButtonProps) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        {
          minHeight: t.sizes.button.lg,
          borderRadius: t.radii.full,
          backgroundColor: pressed ? t.colors.tertiaryButton : t.colors.secondary,
          borderWidth: 1,
          borderColor: t.colors.secondaryBorder,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: t.space[2],
          paddingHorizontal: t.space[6],
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}>
      {icon ? <Icon name={icon} color={t.colors.onSecondary} size={t.sizes.icon.sm} /> : null}
      <Text variant="label" color={t.colors.onSecondary}>
        {label}
      </Text>
    </Pressable>
  );
}
