import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import { Icon, IconButton, Text } from '@/features/shared/ui';

import type { EmergencyInfo } from './types';

/** The red "Call 108" banner: on-device red-flag hit or the server's emergency event. Always one tap from a call. */
export function EmergencyBanner({ info, onDismiss }: { info: EmergencyInfo; onDismiss?: () => void }) {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const s = theme.colors.status.danger;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      testID="emergency-banner"
      style={{ backgroundColor: s.bg, borderColor: s.solid, borderWidth: 2, borderRadius: theme.radii.xl, padding: theme.space[4], gap: theme.space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
        <Icon name="warning" size={theme.sizes.icon.md} color={s.icon} />
        <Text variant="title" color={s.fg} style={{ flex: 1 }}>
          {t('chat.emergencyTitle')}
        </Text>
        {onDismiss ? <IconButton icon="close" accessibilityLabel={t('chat.dismiss')} onPress={onDismiss} variant="soft" /> : null}
      </View>
      <Text variant="bodySmall" color={s.fg}>
        {t('chat.emergencyBody')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        {info.contacts.map((c) => (
          <Pressable
            key={c.number}
            accessibilityRole="button"
            accessibilityLabel={`${t(`chat.${c.labelKey}`)} ${c.number}`}
            onPress={() => void Linking.openURL(`tel:${c.number}`)}
            testID={`call-${c.number}`}
            style={{ minHeight: 48, paddingHorizontal: theme.space[4], borderRadius: theme.radii.full, backgroundColor: s.solid, flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
            <Icon name="call" size={theme.sizes.icon.sm} color={theme.colors.textOnAccent} />
            <Text variant="label" color={theme.colors.textOnAccent}>
              {t('chat.call', { label: t(`chat.${c.labelKey}`), number: c.number })}
            </Text>
          </Pressable>
        ))}
      </View>
      {info.steps.length ? (
        <View style={{ gap: theme.space[1] }}>
          {info.steps.slice(0, 4).map((step, i) => (
            <Text key={i} variant="bodySmall" color={s.fg}>
              {`${i + 1}. ${step}`}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
