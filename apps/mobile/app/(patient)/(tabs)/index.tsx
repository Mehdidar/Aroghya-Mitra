import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, View } from 'react-native';

import { useCurrentUser } from '@/features/shared/state/session';
import { demoPatientHome } from '@/features/shared/seed/patientHome';
import { useTheme } from '@/features/shared/theme';
import {
  Avatar,
  Card,
  GlowOrb,
  Icon,
  IconButton,
  ReadAloud,
  Screen,
  SearchBar,
  SectionHeader,
  ServiceTile,
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
  else if (id === 'reports') router.push('/health');
  else if (id === 'voice') router.push('/voice');
  else if (id === 'chat') router.push('/assistant');
  else if (id === 'prescription') router.push('/prescription');
  else if (id === 'hospitalMap') router.push('/hospital');
  else if (id === 'qrCard') router.push('/qr-card');
  else if (id === 'bloodBanks') router.push('/blood-banks');
  else router.push({ pathname: '/service/[id]', params: { id } });
}

/** Emergency ambulance: one tap, no confirmation screen in between. */
function call108() {
  void Linking.openURL('tel:108');
}

/**
 * Patient Home matching Image 1 (left) & Image 3 (middle):
 * Greeting, search, 8 services, Best Medical Services banner, Upcoming Appointments,
 * Analytics preview (steps & oxygen), AI assistant banner, and reminders.
 */
export default function PatientHome() {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const user = useCurrentUser();
  const name = user?.name ?? 'Rekha Kumari';
  const firstName = name.split(' ')[0];
  const { reminders } = demoPatientHome;

  return (
    <Screen withTabBar testID="screen-patient-home" contentStyle={{ gap: theme.layout.sectionGap - 8 }}>
      {/* Greeting row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <Avatar name={name} />
        <View style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={2}>
            {t('home.greeting', { name: firstName })}
          </Text>
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {t('home.subtitle')}
          </Text>
        </View>
        <IconButton
          icon="search-outline"
          accessibilityLabel={t('common:actions.search')}
          onPress={() => router.push('/appointments')}
        />
        <IconButton
          icon="notifications-outline"
          badge
          accessibilityLabel={t('common:actions.notifications')}
          onPress={() => router.push('/appointments')}
        />
      </View>

      <SearchBar placeholder={t('home.searchPlaceholder')} testID="home-search" />

      {/* Services Grid (Image 1 left) */}
      <View style={{ gap: theme.space[3] }}>
        <View style={{ flexDirection: 'row', gap: theme.space[2], flexWrap: 'wrap', marginBottom: theme.space[2] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.call108')}
            accessibilityHint={t('home.call108Hint')}
            onPress={call108}
            testID="call-108"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space[2],
              minHeight: theme.sizes.touchMin,
              paddingHorizontal: theme.space[4],
              borderRadius: theme.radii.full,
              backgroundColor: theme.colors.status.danger.solid,
              opacity: pressed ? 0.85 : 1,
            })}>
            <Icon name="call" size={theme.sizes.icon.sm} color={theme.colors.textOnDark} />
            <Text weight="semibold" color={theme.colors.textOnDark}>
              {t('home.call108')}
            </Text>
          </Pressable>
          <ReadAloud text={`${t('home.greeting', { name: firstName })}. ${t('home.subtitle')}. ${t('home.services')}: ${SERVICES.map((s) => t(`services.${s.id}`)).join(', ')}.`} />
        </View>
        <SectionHeader title={t('home.services')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: theme.space[4] }}>
          {SERVICES.map((s) => (
            <View key={s.id} style={{ width: '25%', paddingHorizontal: theme.space[1] }}>
              <ServiceTile label={t(`services.${s.id}`)} icon={s.icon} tint={s.tint} onPress={() => openService(s.id)} testID={`service-${s.id}`} />
            </View>
          ))}
        </View>
      </View>

      {/* "Get the Best Medical Services" Hero Banner (Image 1 left) */}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/appointments')}
        style={({ pressed }) => ({
          borderRadius: 24,
          padding: 20,
          backgroundColor: '#CCFBF1',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          overflow: 'hidden',
          opacity: pressed ? 0.92 : 1,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
        })}>
        <View style={{ flex: 1, gap: 6, paddingRight: 10 }}>
          <Text variant="title" weight="bold" style={{ color: '#0F766E', fontSize: 18 }}>
            Get the Best Medical Services
          </Text>
          <Text variant="caption" style={{ color: '#115E59', lineHeight: 18 }}>
            We provide best quality medical service without further cost.
          </Text>
          <View
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 14,
              backgroundColor: '#0F766E',
              marginTop: 4,
            }}>
            <Text variant="caption" weight="bold" style={{ color: '#FFFFFF' }}>
              Book Doctor
            </Text>
          </View>
        </View>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: '#99F6E4',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="medkit" size={36} color="#0F766E" />
        </View>
      </Pressable>

      {/* Upcoming Appointments (Image 1 left & Image 3 right) */}
      <View style={{ gap: theme.space[3] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionHeader title={t('home.appointments')} />
          <Pressable onPress={() => router.push('/appointments')}>
            <Text variant="caption" weight="semibold" tone="secondary">
              {t('home.viewAll')}
            </Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {/* Card 1: Teal Accent */}
          <Pressable
            onPress={() => router.push('/appointments')}
            style={{
              width: 250,
              flexDirection: 'row',
              borderRadius: 20,
              backgroundColor: '#0D9488',
              overflow: 'hidden',
            }}>
            <View
              style={{
                width: 64,
                backgroundColor: 'rgba(0, 0, 0, 0.15)',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}>
              <Text variant="h2" weight="bold" style={{ color: '#FFFFFF' }}>
                12
              </Text>
              <Text variant="caption" style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
                Tue
              </Text>
            </View>
            <View style={{ flex: 1, padding: 14, gap: 4 }}>
              <Text variant="caption" style={{ color: '#99F6E4' }}>
                09:30 AM
              </Text>
              <Text variant="bodySmall" weight="bold" style={{ color: '#FFFFFF' }}>
                Dr. Mim Akhter
              </Text>
              <Text variant="caption" style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
                Depression
              </Text>
            </View>
          </Pressable>

          {/* Card 2: Orange Accent */}
          <Pressable
            onPress={() => router.push('/appointments')}
            style={{
              width: 250,
              flexDirection: 'row',
              borderRadius: 20,
              backgroundColor: '#EA580C',
              overflow: 'hidden',
            }}>
            <View
              style={{
                width: 64,
                backgroundColor: 'rgba(0, 0, 0, 0.15)',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}>
              <Text variant="h2" weight="bold" style={{ color: '#FFFFFF' }}>
                15
              </Text>
              <Text variant="caption" style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
                Fri
              </Text>
            </View>
            <View style={{ flex: 1, padding: 14, gap: 4 }}>
              <Text variant="caption" style={{ color: '#FED7AA' }}>
                11:30 AM
              </Text>
              <Text variant="bodySmall" weight="bold" style={{ color: '#FFFFFF' }}>
                Dr. Olivia Wilson
              </Text>
              <Text variant="caption" style={{ color: 'rgba(255, 255, 255, 0.75)' }}>
                Dermatologist
              </Text>
            </View>
          </Pressable>
        </ScrollView>
      </View>

      {/* Analytics Preview: Steps & Oxygen level (Image 3 middle) */}
      <View style={{ gap: theme.space[2] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionHeader title={t('home.analytics')} />
          <Pressable onPress={() => router.push('/insights')}>
            <Text variant="caption" weight="semibold" tone="secondary">
              {t('home.viewAnalytics')}
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Steps Card */}
          <Pressable
            onPress={() => router.push('/insights')}
            style={{
              flex: 1,
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              padding: 16,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              gap: 8,
            }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption" tone="secondary">
                Steps
              </Text>
              <Icon name="footsteps-outline" size={16} color="#EA580C" />
            </View>
            <Text variant="title" weight="bold" style={{ color: '#0F172A' }}>
              2,595
            </Text>
            <Text variant="caption" tone="tertiary" style={{ fontSize: 11 }}>
              of 3,000 goal
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 26, marginTop: 4 }}>
              {[0.4, 0.6, 0.5, 0.9, 0.75, 0.85, 0.6].map((v, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: v * 26,
                    borderRadius: 2,
                    backgroundColor: '#FB923C',
                  }}
                />
              ))}
            </View>
          </Pressable>

          {/* Oxygen Level Card */}
          <Pressable
            onPress={() => router.push('/insights')}
            style={{
              flex: 1,
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              padding: 16,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              gap: 8,
            }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption" tone="secondary">
                Oxygen level
              </Text>
              <Icon name="pulse-outline" size={16} color="#0284C7" />
            </View>
            <Text variant="title" weight="bold" style={{ color: '#0F172A' }}>
              98%
            </Text>
            <Text variant="caption" style={{ color: '#0D9488', fontSize: 11 }}>
              normal
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 26, marginTop: 4 }}>
              <Icon name="analytics-outline" size={28} color="#0284C7" />
            </View>
          </Pressable>
        </View>
      </View>

      {/* AI assistant hero banner */}
      <Card tone="inverse" radius="xl" padding="lg" onPress={() => router.push('/assistant')} accessibilityLabel={t('ai.title')} testID="ai-banner">
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
