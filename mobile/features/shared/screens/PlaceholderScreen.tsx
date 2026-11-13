import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import { EmptyState, Heading, IconButton, Pill, Screen, type IconName } from '@/features/shared/ui';

/** Tidy "coming soon" screen. Pass `back` for stack screens, `withTabBar` for tab screens. */
export function PlaceholderScreen({
  title,
  body,
  icon,
  owner,
  back,
  withTabBar,
  testID,
}: {
  title: string;
  body?: string;
  icon: IconName;
  owner?: string;
  back?: boolean;
  withTabBar?: boolean;
  testID?: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Screen withTabBar={withTabBar} testID={testID} contentStyle={{ gap: theme.space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        {back ? (
          <IconButton icon="arrow-back" flipInRTL accessibilityLabel={t('actions.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        ) : null}
        <Heading variant={back ? 'h3' : 'h1'} style={{ flexShrink: 1 }}>
          {title}
        </Heading>
      </View>
      <EmptyState
        icon={icon}
        title={t('placeholder.comingSoon')}
        body={body ?? t('placeholder.body')}
        action={owner ? <Pill label={t('placeholder.owner', { owner })} tone="neutral" icon="construct-outline" /> : undefined}
      />
    </Screen>
  );
}
