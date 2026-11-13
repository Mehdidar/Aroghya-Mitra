import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';

import { TabBar, tabIcon } from '@/features/shared/ui';

/** Patient tabs (P1 owns this file: ask P1 to add a tab). */
export default function PatientTabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home-outline', 'home') }} />
      <Tabs.Screen name="records" options={{ title: t('tabs.records'), tabBarIcon: tabIcon('document-text-outline', 'document-text') }} />
      <Tabs.Screen name="assistant" options={{ title: t('tabs.assistant'), tabBarIcon: tabIcon('sparkles-outline', 'sparkles') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person-outline', 'person') }} />
    </Tabs>
  );
}
