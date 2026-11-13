import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useCurrentUser } from '@/features/shared/state/session';
import { demoPatientHome } from '@/features/shared/seed/patientHome';
import { useTheme } from '@/features/shared/theme';
import {
  Avatar,
  Card,
  GlowOrb,
  Icon,
  IconButton,
  Screen,
  SearchBar,
  SectionHeader,
  ServiceTile,
  StatCard,
  Text,
  type IconName,
  type TileTint,
} from '@/features/shared/ui';

type ServiceId = 'chat' | 'voice' | 'prescription' | 'nutrition' | 'hospitalMap' | 'qrCard' | 'bloodBanks' | 'reports';

const SERVICES: { id: ServiceId; icon: IconName; tint: TileTint }[] = [
  { id: 'chat', icon: 'chatbubbles', tint: 'blue' },
  { id: 'voice', icon: 'mic', tint: 'lavender' },
  { id: 'prescription', icon: 'document-text', tint: 'butter' },
  { id: 'nutrition', icon: 'nutrition', tint: 'mint' },
  { id: 'hospitalMap', icon: 'map', tint: 'pink' },
  { id: 'qrCard', icon: 'qr-code', tint: 'blue' },
  { id: 'bloodBanks', icon: 'water', tint: 'pink' },
  { id: 'reports', icon: 'folder-open', tint: 'lavender' },
];

function openService(id: ServiceId) {
  if (id === 'nutrition') router.push('/nutrition');
  else router.push({ pathname: '/service/[id]', params: { id } });
}

/** Patient Home (SPEC §7 phase 2): greeting, search, services, AI banner, stats, reminders. */
export default function PatientHome() {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const user = useCurrentUser();
  const name = user?.name ?? 'Lakshmi Gowda';
  const firstName = name.split(' ')[0];
  const { vitals, reminders } = demoPatientHome;

  return (
    <Screen withTabBar testID="screen-patient-home" contentStyle={{ gap: theme.layout.sectionGap - 4 }}>
      {/* Greeting row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <Avatar name={name} />
        <View style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={1}>
            {t('home.greeting', { name: firstName })}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {t('home.subtitle')}
          </Text>
        </View>
        <IconButton icon="search-outline" accessibilityLabel={t('common:actions.search')} />
        <IconButton icon="notifications-outline" badge accessibilityLabel={t('common:actions.notifications')} />
      </View>

      <SearchBar placeholder={t('home.searchPlaceholder')} testID="home-search" />

      {/* Services */}
      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('home.services')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: theme.space[4] }}>
          {SERVICES.map((s) => (
            <View key={s.id} style={{ width: '25%', paddingHorizontal: theme.space[1] }}>
              <ServiceTile label={t(`services.${s.id}`)} icon={s.icon} tint={s.tint} onPress={() => openService(s.id)} testID={`service-${s.id}`} />
            </View>
          ))}
        </View>
      </View>

      {/* AI assistant hero banner */}
      <Card tone="inverse" radius="xl" padding="lg" onPress={() => openService('chat')} accessibilityLabel={t('ai.title')} testID="ai-banner">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[4] }}>
          <View style={{ flex: 1, gap: theme.space[2] }}>
            <Text variant="h3" tone="inverse">
              {t('ai.title')}
            </Text>
            <Text variant="bodySmall" tone="inverseSecondary">
              {t('ai.body')}
            </Text>
            <View
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space[2],
                marginTop: theme.space[2],
                minHeight: 40,
                paddingHorizontal: theme.space[4],
                borderRadius: theme.radii.full,
                backgroundColor: theme.colors.surface,
              }}>
              <Text variant="label">{t('ai.cta')}</Text>
              <Icon name="arrow-forward" size={theme.sizes.icon.sm} flipInRTL />
            </View>
          </View>
          <GlowOrb size={88}>
            <Icon name="heart" size={36} color={theme.colors.textOnDark} />
          </GlowOrb>
        </View>
      </Card>

      {/* Stats */}
      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('home.today')} />
        <View style={{ flexDirection: 'row', gap: theme.space[3], flexWrap: 'wrap' }}>
          <StatCard
            label={t('stats.heartRate')}
            value={String(vitals.heartRateBpm)}
            unit="bpm"
            caption={t('stats.normal')}
            icon="pulse"
            chart="ecg"
            testID="stat-heart"
          />
          <StatCard
            label={t('stats.weight')}
            value={String(vitals.weightKg)}
            unit={t('stats.kg')}
            caption={t('stats.lastWeek')}
            icon="barbell-outline"
            chart="bars"
            testID="stat-weight"
          />
        </View>
      </View>

      {/* Reminders */}
      <Card radius="xl" testID="reminders-card">
        <SectionHeader title={t('home.reminders')} />
        {reminders.map((r, i) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            onPress={() => openService('prescription')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space[3],
              minHeight: theme.sizes.touchMin + 8,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: theme.colors.divider,
              paddingTop: i === 0 ? 0 : theme.space[3],
            }}>
            <View
              style={{
                width: theme.sizes.iconChip,
                height: theme.sizes.iconChip,
                borderRadius: theme.radii.sm,
                backgroundColor: r.medicine ? theme.colors.tile.mint.bg : theme.colors.tile.blue.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name={r.icon} color={r.medicine ? theme.colors.tile.mint.icon : theme.colors.tile.blue.icon} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {r.medicine ?? t(`reminders.${r.timingKey}`)}
              </Text>
              <Text variant="caption" tone="tertiary">
                {r.medicine ? t(`reminders.${r.timingKey}`) : t('reminders.checkupPlace')}
              </Text>
            </View>
            {r.time ? (
              <Text variant="label" tone="accent" numeric>
                {r.time}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
