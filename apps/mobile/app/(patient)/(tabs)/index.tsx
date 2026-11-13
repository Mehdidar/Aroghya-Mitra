import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import { currentPatientId, useCurrentUser } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import {
  Avatar,
  Card,
  GlowOrb,
  Icon,
  IconButton,
  ReadAloud,
  Screen,
  SectionHeader,
  ServiceTile,
  Text,
  type IconName,
  type TileTint,
} from '@/features/shared/ui';
import { pullPatientRecords, usePullWhileOpen } from '@/features/shared/data/serverSync';
import { StepsCard } from '@/features/patient/steps/StepsCard';
import { useReminders } from '@/features/patient/reminders/useReminders';
import { VoiceHeroCard } from '@/features/patient/voice/VoiceHeroCard';

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
 * Patient home: greeting, the big voice assistant card, Call 108, the services,
 * today's real step count, the AI assistant banner and today's reminders.
 * Only real features and data: no placeholder appointments or invented vitals.
 */
export default function PatientHome() {
  usePullWhileOpen(() => pullPatientRecords(currentPatientId()), 'patient-records');
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const user = useCurrentUser();
  const name = user?.name ?? 'Rekha Kumari';
  const firstName = name.split(' ')[0];

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
        <IconButton icon="notifications-outline" accessibilityLabel={t('common:actions.notifications')} onPress={() => router.push('/reminders')} />
      </View>

      {/* Big voice assistant button: the first thing on the screen */}
      <VoiceHeroCard />


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

      {/* Real step counter from the phone's motion sensor */}
      <StepsCard />

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

      {/* Today's next doses, from the patient's real reminder plan */}
      <UpcomingDoses />
    </Screen>
  );
}

/** The next doses still to take today (at most three), from the same plan as the Reminders tab. */
function UpcomingDoses() {
  const { t, i18n } = useTranslation('patient');
  const theme = useTheme();
  const { timeline } = useReminders();
  const next = timeline.filter((x) => x.status === 'due' || x.status === 'upcoming').slice(0, 3);
  const time = (d: Date) => new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' }).format(d);
  return (
    <Card radius="xl" testID="reminders-card">
      <SectionHeader title={t('home.reminders')} />
      {next.length === 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/reminders')} style={{ minHeight: theme.sizes.touchMin, justifyContent: 'center' }}>
          <Text tone="secondary">{timeline.length ? t('home.dosesDone') : t('home.noDoses')}</Text>
        </Pressable>
      ) : (
        next.map((x, i) => (
          <Pressable
            key={x.dose.id}
            accessibilityRole="button"
            onPress={() => router.push('/reminders')}
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
                backgroundColor: x.status === 'due' ? theme.colors.status.warning.bg : theme.colors.tile.mint.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="medical" color={x.status === 'due' ? theme.colors.status.warning.icon : theme.colors.tile.mint.icon} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {x.dose.medicineName}
              </Text>
              {x.dose.dose ? (
                <Text variant="caption" tone="tertiary" numberOfLines={1}>
                  {x.dose.dose}
                </Text>
              ) : null}
            </View>
            <Text variant="label" tone="accent" numeric>
              {x.status === 'due' ? t('home.dueNow') : time(x.dose.at)}
            </Text>
          </Pressable>
        ))
      )}
    </Card>
  );
}
