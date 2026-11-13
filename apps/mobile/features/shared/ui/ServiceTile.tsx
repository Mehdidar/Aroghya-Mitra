import { useState } from 'react';
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

/**
 * Square pastel tile with a coloured icon and a label below (the "Services" row).
 *
 * The square is sized from the measured column width (at most 88 pt). Relying on
 * width: '100%' + maxWidth + aspectRatio drew tall narrow tiles on iOS, where the
 * height is taken from the unclamped width.
 */
export function ServiceTile({ label, icon, tint, onPress, style, testID }: ServiceTileProps) {
  const t = useTheme();
  const c = t.colors.tile[tint];
  const [column, setColumn] = useState(0);
  const side = Math.max(t.sizes.touchMin, Math.min(88, column || 88));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      onLayout={(e) => setColumn(Math.floor(e.nativeEvent.layout.width))}
      style={({ pressed }) => [{ alignItems: 'center', gap: t.space[2], transform: [{ scale: pressed ? t.motion.pressScale : 1 }] }, style]}>
      <View
        style={{
          width: side,
          height: side,
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
