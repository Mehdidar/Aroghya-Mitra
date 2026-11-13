/** "Synced 2 min ago" / "Offline: will send when connected" / "3 changes waiting": so people know the doctor and ASHA have their latest data. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useSyncStatus } from '@/features/shared/data/outbox';
import { useTheme } from '@/features/shared/theme';
import { Icon, Text } from '@/features/shared/ui';

export function agoKey(ms: number): { key: 'justNow' | 'minutes' | 'hours'; count: number } {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return { key: 'justNow', count: 0 };
  if (min < 60) return { key: 'minutes', count: min };
  return { key: 'hours', count: Math.floor(min / 60) };
}

export function SyncStatusLine() {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const { queued, lastSyncAt, offline } = useSyncStatus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  let icon: 'cloud-done-outline' | 'cloud-offline-outline' | 'cloud-upload-outline' | 'cloud-outline' = 'cloud-outline';
  let text = t('sync.never');
  let color = theme.colors.textTertiary;
  if (offline) {
    icon = 'cloud-offline-outline';
    text = queued ? t('sync.offlineWaiting', { count: queued }) : t('sync.offline');
    color = theme.colors.status.warning.fg;
  } else if (queued) {
    icon = 'cloud-upload-outline';
    text = t('sync.waiting', { count: queued });
  } else if (lastSyncAt) {
    icon = 'cloud-done-outline';
    const a = agoKey(now - lastSyncAt);
    text = t(`sync.${a.key}`, { count: a.count });
    color = theme.colors.status.success.fg;
  }
  return (
    <View accessibilityRole="text" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[1] }} testID="sync-status">
      <Icon name={icon} size={16} color={color} />
      <Text variant="caption" color={color} numberOfLines={2} style={{ flexShrink: 1 }}>
        {text}
      </Text>
    </View>
  );
}
