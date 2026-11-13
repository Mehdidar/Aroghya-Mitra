import { View } from 'react-native';

import { useTheme } from '@/features/shared/theme';

import { Text } from './Text';

/** Rounded-square avatar with the person's initial (no photos of people). */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const t = useTheme();
  const px = t.sizes.avatar[size];
  const initial = (name.replace(/^Dr\.?\s+/i, '').trim()[0] ?? '?').toUpperCase();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: px,
        height: px,
        borderRadius: t.radii.sm,
        backgroundColor: t.accent.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text variant="title" weight="bold" color={t.accent.accentSoftText}>
        {initial}
      </Text>
    </View>
  );
}
