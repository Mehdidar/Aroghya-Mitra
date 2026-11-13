import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';

import { TabBar, tabIcon } from '@/features/shared/ui';

/** Doctor / Admin shell (P1 placeholder, indigo accent). P4 replaces the screen contents. */
export default function DoctorTabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: t('tabs.dashboard'), tabBarIcon: tabIcon('grid-outline', 'grid') }} />
      <Tabs.Screen name="patients" options={{ title: t('tabs.patients'), tabBarIcon: tabIcon('people-outline', 'people') }} />
      <Tabs.Screen name="inbox" options={{ title: t('tabs.inbox'), tabBarIcon: tabIcon('mail-outline', 'mail') }} />
      <Tabs.Screen name="doctor-profile" options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person-outline', 'person') }} />
    </Tabs>
  );
}
