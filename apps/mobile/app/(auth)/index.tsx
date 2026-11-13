import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useSession } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { GlassCross, Heading, PrimaryButton, Screen, SecondaryButton, Text } from '@/features/shared/ui';

/** Onboarding: pale-blue -> white gradient, glass medical cross, headline, black pill CTA. */
export default function Onboarding() {
  const { t } = useTranslation('auth');
  const theme = useTheme();
  const { meta } = useLanguage();
  const onboarded = useSession((s) => s.onboarded);
  if (onboarded) return <Redirect href="/role" />;

  return (
    <Screen
      background="hero"
      testID="screen-onboarding"
      footer={
        <>
          <PrimaryButton label={t('onboarding.cta')} trailingArrow onPress={() => router.push('/language')} testID="onboarding-cta" />
          <SecondaryButton
            label={t('onboarding.languageButton', { language: meta.native })}
            icon="language"
            onPress={() => router.push('/language')}
            style={{ backgroundColor: theme.colors.glassFillStrong }}
          />
        </>
      }>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space[6], paddingVertical: theme.space[8] }}>
        <GlassCross size={180} />
        <View style={{ gap: theme.space[3], alignItems: 'center', maxWidth: 360 }}>
          <Text variant="overline" tone="accent" align="center">
            {t('common:appName')}
          </Text>
          <Heading variant="h1" align="center" color={theme.colors.textOnHero}>
            {t('onboarding.headline')}
          </Heading>
          <Text variant="body" align="center" color={theme.colors.textOnHeroSecondary}>
            {t('onboarding.body')}
          </Text>
        </View>
      </View>
    </Screen>
  );
}
