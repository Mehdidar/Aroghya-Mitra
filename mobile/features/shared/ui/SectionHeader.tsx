import { Pressable, View } from 'react-native';

import { useTheme } from '@/features/shared/theme';

import { Text } from './Text';

/** Section title with an optional trailing text link ("See all"). */
export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space[3] }}>
      <Text variant="h3" accessibilityRole="header" style={{ flexShrink: 1 }}>
        {title}
      </Text>
      {actionLabel ? (
        <Pressable accessibilityRole="link" onPress={onAction} hitSlop={t.sizes.hitSlop} style={{ minHeight: t.sizes.touchMin, justifyContent: 'center' }}>
          <Text variant="bodySmall" weight="semibold" tone="accent">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
