import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { currentPatientId, useCurrentUser } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import {
  Avatar,
  Icon,
  IconButton,
  Screen,
  SectionHeader,
  ServiceTile,
  Text,
  type IconName,
  type TileTint,
} from '@/features/shared/ui';
import { pullPatientRecords, usePullWhileOpen } from '@/features/shared/data/serverSync';
import { StepsCard } from '@/features/patient/steps/StepsCard';
import { LanguageChip } from '@/features/patient/home/LanguageChip';
import { NextDoseCard } from '@/features/patient/home/NextDoseCard';
import { SyncStatusLine } from '@/features/patient/home/SyncStatusLine';
import { VoiceHeroCard } from '@/features/patient/voice/VoiceHeroCard';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';
import { useReminders } from '@/features/patient/reminders/useReminders';

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
  else if (id === 'hospitalMap') router.push('/nearby');
  else if (id === 'qrCard') router.push('/qr-card');
  else if (id === 'bloodBanks') router.push('/blood-banks');
  else router.push({ pathname: '/service/[id]', params: { id } });
}

/** Emergency ambulance: one tap, no confirmation screen in between. */
/**
 * Patient home, most useful first: greeting (with language and sync status),
 * the big voice card (or type instead), the next medicine with a Taken button,
 * Call 108, the services and today's real step count. A red 108 button also
 * floats on every patient screen (EmergencyButton in the patient layout).
 */
export default function PatientHome() {
  usePullWhileOpen(() => pullPatientRecords(currentPatientId()), 'patient-records');
  const { t, i18n } = useTranslation('patient');
  const theme = useTheme();
  const user = useCurrentUser();
  const name = user?.name ?? 'Rekha Kumari';
  const firstName = name.split(' ')[0];
  // The spoken guide ends with the live next medicine.
  const { timeline } = useReminders();
  const nextDose = timeline.find((x) => x.status === 'due' || x.status === 'upcoming');
  const guideExtra = nextDose
    ? t('guide:nextDose', {
        name: nextDose.dose.medicineName,
        when: nextDose.status === 'due' ? t('home.dueNow') : new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' }).format(nextDose.dose.at),
      })
    : timeline.length
      ? t('guide:noDose')
      : '';

  return (
    <Screen withTabBar testID="screen-patient-home" contentStyle={{ gap: theme.layout.sectionGap - 8 }}>
      {/* Greeting row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <Avatar name={name} />
        <View style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={2}>
            {t('home.greeting', { name: firstName })}
          </Text>
          <SyncStatusLine />
        </View>
        <LanguageChip />
        <IconButton icon="notifications-outline" accessibilityLabel={t('common:actions.notifications')} onPress={() => router.push('/reminders')} />
      </View>

      {/* Big voice assistant button: the first thing on the screen */}
      <View style={{ gap: theme.space[2] }}>
        <VoiceHeroCard />
        <Pressable accessibilityRole="link" onPress={() => router.push('/assistant')} testID="type-instead" style={{ alignSelf: 'center', minHeight: theme.sizes.touchMin, flexDirection: 'row', alignItems: 'center', gap: theme.space[1], paddingHorizontal: theme.space[3] }}>
          <Icon name="chatbubble-ellipses-outline" size={18} color={theme.accent.accentText} />
          <Text variant="label" weight="semibold" color={theme.accent.accentText}>
            {t('home.typeInstead')}
          </Text>
        </Pressable>
      </View>

      {/* Today's next medicine, with a Taken button */}
      <NextDoseCard />


      {/* Services Grid (Image 1 left) */}
      <View style={{ gap: theme.space[3] }}>
        <View style={{ flexDirection: 'row', gap: theme.space[2], flexWrap: 'wrap', marginBottom: theme.space[2] }}>
          <ScreenGuide id="home" extra={guideExtra} />
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

    </Screen>
  );
}
