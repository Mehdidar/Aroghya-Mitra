import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';

import { TabBar, tabIcon } from '@/features/shared/ui';

/** Doctor / Admin tabs: Dashboard · Patients · Referrals · Admin (profile opens from the Admin tab header). */
export default function DoctorTabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.dashboard'), tabBarIcon: tabIcon('grid-outline', 'grid') }} />
      <Tabs.Screen name="patients" options={{ title: t('tabs.patients'), tabBarIcon: tabIcon('people-outline', 'people') }} />
      <Tabs.Screen name="referrals" options={{ title: t('tabs.referrals'), tabBarIcon: tabIcon('mail-outline', 'mail') }} />
      <Tabs.Screen name="admin" options={{ title: t('tabs.admin'), tabBarIcon: tabIcon('settings-outline', 'settings') }} />
    </Tabs>
  );
}
