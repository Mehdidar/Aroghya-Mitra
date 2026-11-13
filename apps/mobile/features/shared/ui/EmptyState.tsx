import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/features/shared/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
  testID?: string;
};

/** Centred icon chip, title and short body for empty or not-yet-built screens. */
export function EmptyState({ icon, title, body, action, testID }: EmptyStateProps) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: t.space[12], gap: t.space[3] }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: t.radii.xl,
          backgroundColor: t.accent.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: t.space[2],
        }}>
        <Icon name={icon} size={t.sizes.icon.xl} color={t.accent.accentIcon} />
      </View>
      <Text variant="h3" align="center" accessibilityRole="header">
        {title}
      </Text>
      {body ? (
        <Text variant="bodySmall" tone="secondary" align="center" style={{ maxWidth: 320 }}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}
