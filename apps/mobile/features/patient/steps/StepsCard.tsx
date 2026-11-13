/** Home-screen step counter: today's real steps, a goal bar and the week, from the phone's motion sensor. */
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import { Card, Icon, SecondaryButton, Text } from '@/features/shared/ui';

import { distanceKm, goalProgress } from './stepsLogic';
import { useSteps } from './useSteps';

const STEP_COLOUR = '#EA580C';

export function StepsCard() {
  const { t, i18n } = useTranslation('patient');
  const theme = useTheme();
  const { state, goal, requestPermission } = useSteps();
  const fmt = (n: number) => new Intl.NumberFormat(i18n.language).format(n);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFEDD5' }}>
        <Icon name="footsteps" size={20} color={STEP_COLOUR} />
      </View>
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        {t('steps.title')}
      </Text>
    </View>
  );

  if (state.status === 'loading') return null;

  if (state.status !== 'ready') {
    return (
      <Card radius="xl" testID="steps-card">
        {header}
        <Text variant="bodySmall" tone="secondary">
          {state.status === 'unavailable' ? t('steps.unavailable') : t('steps.denied')}
        </Text>
        {state.status === 'denied' && state.canAsk ? <SecondaryButton label={t('steps.allow')} icon="walk-outline" onPress={() => void requestPermission()} /> : null}
      </Card>
    );
  }

  const p = goalProgress(state.today, goal);
  const best = Math.max(goal, ...state.week.map((w) => w.steps));
  return (
    <Card radius="xl" testID="steps-card" accessibilityLabel={`${t('steps.title')}: ${fmt(state.today)}`}>
      {header}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space[2] }}>
        <Text numeric style={{ fontSize: 40, lineHeight: 44, fontWeight: '700' }} testID="steps-today">
          {fmt(state.today)}
        </Text>
        <Text variant="bodySmall" tone="secondary" style={{ marginBottom: 6 }}>
          {t('steps.ofGoal', { goal: fmt(goal) })}
        </Text>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: theme.colors.surfaceSunken, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: goal, now: Math.min(state.today, goal) }}>
        <View style={{ width: `${p * 100}%`, height: '100%', borderRadius: 5, backgroundColor: p >= 1 ? theme.colors.status.success.solid : STEP_COLOUR }} />
      </View>
      <Text variant="caption" tone="secondary">
        {p >= 1 ? t('steps.goalReached') : t('steps.distance', { km: fmt(distanceKm(state.today)) })}
      </Text>

      {state.week.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 64, marginTop: theme.space[1] }} accessibilityLabel={t('steps.week')}>
          {state.week.map((w, i) => {
            const today = i === state.week.length - 1;
            return (
              <View key={w.date.toISOString()} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View style={{ width: '100%', height: 44, justifyContent: 'flex-end' }}>
                  <View style={{ height: Math.max(3, (w.steps / best) * 44), borderRadius: 4, backgroundColor: today ? STEP_COLOUR : '#FED7AA' }} />
                </View>
                <Text variant="caption" tone={today ? 'primary' : 'tertiary'} numberOfLines={1}>
                  {new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' }).format(w.date)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {!state.allDay ? (
        <Text variant="caption" tone="tertiary">
          {t('steps.whileOpen')}
        </Text>
      ) : null}
    </Card>
  );
}
