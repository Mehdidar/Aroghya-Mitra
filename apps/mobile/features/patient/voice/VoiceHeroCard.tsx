/**
 * The first thing on the patient's home screen: a big glowing "tap and speak"
 * card that opens the voice assistant. Large on purpose: speaking is the
 * easiest way in for someone who does not read or type comfortably.
 */
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import { Icon, Text } from '@/features/shared/ui';

import { PANEL, VoicePanel } from './VoicePanel';

export function VoiceHeroCard() {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('voice.heroTitle')}. ${t('voice.heroCta')}`}
      accessibilityHint={t('voice.heroBody')}
      onPress={() => router.push('/voice')}
      testID="voice-hero"
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.985 : 1 }] })}>
      <VoicePanel radius={32}>
        <View style={{ alignItems: 'center', paddingTop: theme.space[6], paddingBottom: theme.space[5], paddingHorizontal: theme.space[5], gap: theme.space[2] }}>
          <Text align="center" color={PANEL.text} style={{ fontSize: 26, lineHeight: 32, fontWeight: '700', textShadowColor: 'rgba(24, 70, 184, 0.45)', textShadowRadius: 10 }}>
            {t('voice.heroTitle')}
          </Text>
          <Text variant="bodySmall" align="center" color={PANEL.textSoft} style={{ maxWidth: 300, textShadowColor: 'rgba(24, 70, 184, 0.45)', textShadowRadius: 8 }}>
            {t('voice.heroBody')}
          </Text>

          {/* Glowing mic orb */}
          <View style={{ marginTop: theme.space[4], marginBottom: theme.space[3], alignItems: 'center', justifyContent: 'center' }}>
            <View
              pointerEvents="none"
              style={{ position: 'absolute', width: 168, height: 168, borderRadius: 168, backgroundColor: 'rgba(143, 220, 251, 0.25)', boxShadow: '0px 0px 48px 12px rgba(143, 220, 251, 0.45)' }}
            />
            <View
              style={{
                width: 116,
                height: 116,
                borderRadius: 116,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#4FB3F2',
                backgroundImage: theme.highContrast ? undefined : 'radial-gradient(circle at 35% 30%, #EAFBFF 0%, #7FD3F7 30%, #2F8BE6 70%, #1846B8 100%)',
                borderWidth: 2,
                borderColor: 'rgba(255, 255, 255, 0.55)',
              }}>
              <Icon name="mic" size={52} color="#FFFFFF" />
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space[2],
              minHeight: 48,
              paddingHorizontal: theme.space[5],
              borderRadius: 999,
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
            }}>
            <Icon name="mic-outline" size={20} color={PANEL.deep} />
            <Text variant="label" weight="semibold" color={PANEL.deep}>
              {t('voice.heroCta')}
            </Text>
          </View>
        </View>
      </VoicePanel>
    </Pressable>
  );
}
