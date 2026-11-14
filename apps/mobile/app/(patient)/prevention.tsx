import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { FlagList, GuidelineList, PlanSections } from '@/features/prevention/components';
import { usePreventionPlan } from '@/features/prevention/usePreventionPlan';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';
import { currentPatientId } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, Heading, Icon, IconButton, Pill, Screen, SecondaryButton, SectionHeader, Skeleton, Text } from '@/features/shared/ui';

/**
 * "My preventive care": vaccines, pregnancy check-ups, screening and child
 * growth due for the signed-in patient, computed from Indian national
 * guidelines (packages/patient-ai/prevention), each with its source and
 * review status. Works offline from the last plan saved on the phone.
 */
export default function PreventionScreen() {
  const { t } = useTranslation('prevent');
  const theme = useTheme();
  const patientId = currentPatientId();
  const view = usePreventionPlan(patientId);
  const plan = view.plan;

  return (
    <Screen testID="screen-prevention" contentStyle={{ gap: theme.space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('common:actions.back', { defaultValue: 'Back' })} onPress={() => (router.canGoBack() ? router.back() : router.replace('/health'))} flipInRTL />
        <Heading variant="h2" style={{ flex: 1 }}>
          {t('title')}
        </Heading>
      </View>
      <ScreenGuide id="prevention" />
      <Text variant="bodySmall" tone="secondary">
        {t('subtitle')}
      </Text>

      <StatusBanner demo={view.demo} source={view.source} pending={view.pending} />

      {view.loading && !plan ? (
        <View style={{ gap: theme.space[3] }}>
          <Skeleton height={110} radius={theme.radii.xl} />
          <Skeleton height={110} radius={theme.radii.xl} />
        </View>
      ) : !plan || !view.person?.dob ? (
        <EmptyState icon="shield-checkmark-outline" title={t('state.noData')} body={t('state.noDataBody')} testID="prevention-empty" action={<SecondaryButton label={t('action.refresh')} icon="refresh" onPress={() => void view.refresh()} />} />
      ) : (
        <>
          {plan.gestationWeeks !== null ? <Pill label={t('pregnancyWeeks', { n: plan.gestationWeeks })} tone="accent" icon="heart-outline" /> : null}
          <FlagList flags={plan.flags} />
          <PlanSections plan={plan} remind />
          {view.children.length ? (
            <View style={{ gap: theme.space[4] }} testID="prevention-children">
              {view.children.map((c) => (
                <View key={c.patientId} style={{ gap: theme.space[3] }}>
                  <SectionHeader title={t('section.child', { name: c.name })} />
                  <FlagList flags={c.plan.flags} />
                  <PlanSections plan={c.plan} remind />
                </View>
              ))}
            </View>
          ) : null}
          <GuidelineList plan={plan} />
        </>
      )}
    </Screen>
  );
}

function StatusBanner({ demo, source, pending }: { demo: boolean; source: 'server' | 'cache' | 'device'; pending: number }) {
  const { t } = useTranslation('prevent');
  const theme = useTheme();
  const lines = [demo ? t('state.demo') : null, source === 'cache' ? t('state.offline') : source === 'device' ? t('state.device') : null, pending ? t('state.pending', { n: pending }) : null].filter(Boolean);
  if (!lines.length) return null;
  return (
    <Card tone="muted" radius="xl" padding="md" testID="prevention-banner">
      <View style={{ flexDirection: 'row', gap: theme.space[2], alignItems: 'flex-start' }}>
        <Icon name="information-circle" size={theme.sizes.icon.sm} color={theme.colors.status.info.icon} />
        <Text variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
          {lines.join(' ')}
        </Text>
      </View>
    </Card>
  );
}
