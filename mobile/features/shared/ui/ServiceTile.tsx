import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/features/shared/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type TileTint = 'blue' | 'butter' | 'mint' | 'pink' | 'lavender';

export type ServiceTileProps = {
  label: string;
  icon: IconName;
  tint: TileTint;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Square pastel tile with a coloured icon and a label below (the "Services" row). */
export function ServiceTile({ label, icon, tint, onPress, style, testID }: ServiceTileProps) {
  const t = useTheme();
  const c = t.colors.tile[tint];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [{ alignItems: 'center', gap: t.space[2], transform: [{ scale: pressed ? t.motion.pressScale : 1 }] }, style]}>
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
          maxWidth: 88,
          minHeight: t.sizes.touchMin,
          borderRadius: t.radii.lg,
          backgroundColor: c.bg,
          borderWidth: c.border === 'transparent' ? 0 : 1.5,
          borderColor: c.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon name={icon} color={c.icon} size={t.sizes.icon.lg} />
      </View>
      <Text variant="caption" weight="semibold" color={t.colors.tile.label} align="center" numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}
