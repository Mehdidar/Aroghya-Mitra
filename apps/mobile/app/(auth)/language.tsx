import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { LANGUAGES, LANGUAGE_CODES } from '@/features/shared/i18n/languages';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';
import { Heading, Icon, IconButton, PrimaryButton, Screen, Text } from '@/features/shared/ui';

/** Language picker: each language in its own script; switching applies at once (incl. RTL). */
export default function LanguagePicker() {
  const { t } = useTranslation('auth');
  const theme = useTheme();
  const { language, setLanguage } = useLanguage();

  return (
    <Screen
      background="hero"
      testID="screen-language"
      footer={<PrimaryButton label={t('language.continue')} trailingArrow onPress={() => router.push('/role')} testID="language-continue" />}>
      <View style={{ gap: theme.space[5] }}>
        {router.canGoBack() ? (
          <IconButton icon="arrow-back" variant="glass" flipInRTL accessibilityLabel={t('common:actions.back')} onPress={() => router.back()} />
        ) : null}
        <View style={{ gap: theme.space[2] }}>
          <Heading variant="h1">{t('language.title')}</Heading>
          <Text tone="secondary">{t('language.body')}</Text>
        </View>
        <View style={{ gap: theme.space[3] }} role="radiogroup">
          {LANGUAGE_CODES.map((code) => {
            const selected = code === language;
            const meta = LANGUAGES[code];
            return (
              <Pressable
                key={code}
                role="radio"
                aria-checked={selected}
                accessibilityState={{ selected }}
                accessibilityLabel={`${meta.native}, ${meta.english}`}
                testID={`lang-${code}`}
                onPress={() => void setLanguage(code)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space[3],
                  minHeight: 64,
                  paddingHorizontal: theme.space[4],
                  borderRadius: theme.radii.lg,
                  backgroundColor: selected ? theme.colors.surface : theme.colors.glassFillStrong,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? theme.accent.accent : theme.colors.border,
                  transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
                })}>
                <View style={{ flex: 1 }}>
                  <Text variant="title" lang={code}>
                    {meta.native}
                  </Text>
                  <Text variant="caption" tone="tertiary" lang="en">
                    {meta.english}
                  </Text>
                </View>
                <Icon
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  color={selected ? theme.accent.accent : theme.colors.borderStrong}
                  size={theme.sizes.icon.lg}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
