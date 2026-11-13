import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';

import { TabBar, tabIcon } from '@/features/shared/ui';

/** Patient tabs: Home · Health · Reminders · Profile. The AI chat, voice, prescription scanner and nutrition open from Home. */
export default function PatientTabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home-outline', 'home') }} />
      <Tabs.Screen name="health" options={{ title: t('tabs.health'), tabBarIcon: tabIcon('heart-outline', 'heart') }} />
      <Tabs.Screen name="reminders" options={{ title: t('tabs.reminders'), tabBarIcon: tabIcon('alarm-outline', 'alarm') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person-outline', 'person') }} />
    </Tabs>
  );
}
