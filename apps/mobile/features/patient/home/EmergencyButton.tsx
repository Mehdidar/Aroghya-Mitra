/**
 * A red 108 button that stays on every patient screen (bottom corner, above the
 * tab bar). Hidden where the screen has its own bottom controls: the voice call
 * bar and the chat input.
 */
import * as Haptics from 'expo-haptics';
import { usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';
import { Icon, Text } from '@/features/shared/ui';

const TAB_PATHS = new Set(['/', '/health', '/reminders', '/profile']);
const HIDDEN_ON = ['/voice', '/assistant', '/chat'];

export function EmergencyButton() {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isRTL } = useLanguage();
  const path = usePathname();
  if (HIDDEN_ON.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  const onTabs = TAB_PATHS.has(path);
  const bottom = (onTabs ? theme.sizes.tabBar.height + theme.sizes.tabBar.marginBottom : 0) + insets.bottom + theme.space[3];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.call108')}
      accessibilityHint={t('home.call108Hint')}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
        void Linking.openURL('tel:108');
      }}
      testID="emergency-108"
      style={({ pressed }) => ({
        position: 'absolute',
        bottom,
        ...(isRTL ? { left: theme.space[4] } : { right: theme.space[4] }),
        height: 56,
        minWidth: 56,
        paddingHorizontal: theme.space[3],
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        backgroundColor: theme.colors.status.danger.solid,
        boxShadow: '0px 6px 16px -4px rgba(199, 33, 35, 0.55)',
        borderWidth: 2,
        borderColor: '#FFFFFF',
        opacity: pressed ? 0.85 : 1,
      })}>
      <Icon name="call" size={20} color="#FFFFFF" />
      <Text weight="bold" color="#FFFFFF" numeric>
        108
      </Text>
    </Pressable>
  );
}
