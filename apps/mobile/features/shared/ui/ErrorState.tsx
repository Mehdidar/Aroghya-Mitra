import { View } from 'react-native';

import { useTheme } from '@/features/shared/theme';

import { SecondaryButton } from './Buttons';
import { Icon } from './Icon';
import { Text } from './Text';

export type ErrorStateProps = {
  title: string;
  body?: string;
  /** Label for the retry button; omit it for an error with nothing to retry. */
  retryLabel?: string;
  onRetry?: () => void;
  testID?: string;
};

/** Something failed (network, server, permission). Says what, and offers one retry. Never shows a stack trace. */
export function ErrorState({ title, body, retryLabel, onRetry, testID }: ErrorStateProps) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: t.space[10], gap: t.space[3] }}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: t.radii.xl,
          backgroundColor: t.colors.status.danger.bg,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: t.space[2],
        }}>
        <Icon name="cloud-offline-outline" size={t.sizes.icon.xl} color={t.colors.status.danger.icon} />
      </View>
      <Text variant="h3" align="center" accessibilityRole="header">
        {title}
      </Text>
      {body ? (
        <Text variant="bodySmall" tone="secondary" align="center" style={{ maxWidth: 320 }}>
          {body}
        </Text>
      ) : null}
      {onRetry && retryLabel ? <SecondaryButton label={retryLabel} icon="refresh" onPress={onRetry} /> : null}
    </View>
  );
}
