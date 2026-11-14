import { Pressable } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import { Text } from '@/features/shared/ui';

/** Toggle chip (lab orders, slots, filters). 48 pt touch target. */
export function Chip({ label, selected, onPress, testID, accessibilityLabel }: { label: string; selected: boolean; onPress: () => void; testID?: string; accessibilityLabel?: string }) {
  const th = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      testID={testID}
      style={{
        minHeight: th.sizes.touchMin,
        paddingHorizontal: th.space[4],
        justifyContent: 'center',
        borderRadius: th.radii.full,
        borderWidth: 1.5,
        borderColor: selected ? th.accent.accent : th.colors.border,
        backgroundColor: selected ? th.accent.accentSoft : th.colors.surface,
      }}>
      <Text variant="bodySmall" weight={selected ? 'semibold' : 'regular'}>
        {label}
      </Text>
    </Pressable>
  );
}
