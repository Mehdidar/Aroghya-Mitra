import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import {
  Icon,
  IconButton,
  PrimaryButton,
  Screen,
  SectionHeader,
  Text,
  type IconName,
} from '@/features/shared/ui';

type InsightCardItem = {
  id: string;
  icon: IconName;
  iconBg: string;
  iconColor: string;
  title: string;
  body: string;
};

const INSIGHT_ITEMS: InsightCardItem[] = [
  {
    id: 'sleep',
    icon: 'moon',
    iconBg: '#EDE9FE',
    iconColor: '#7C3AED',
    title: 'Sleep is getting more consistent',
    body: 'Your bedtime varied by only 24 minutes this week — 36% steadier than last week.',
  },
  {
    id: 'activity',
    icon: 'walk',
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    title: 'Afternoon activity dipped',
    body: 'A 10-minute walk after lunch could help you reach your daily movement goal.',
  },
  {
    id: 'heart',
    icon: 'heart',
    iconBg: '#FEE2E2',
    iconColor: '#DC2626',
    title: 'Resting heart rate changed',
    body: '7-day average increased from 68 to 74 bpm. Monitor how you feel during exertion.',
  },
];

const SLEEP_DAYS = [
  { day: 'Mon', hours: 7.2, barHeight: 72 },
  { day: 'Tue', hours: 6.8, barHeight: 68 },
  { day: 'Wed', hours: 8.0, barHeight: 88 },
  { day: 'Thu', hours: 7.5, barHeight: 78 },
  { day: 'Fri', hours: 6.4, barHeight: 62 },
  { day: 'Sat', hours: 8.4, barHeight: 92 },
  { day: 'Sun', hours: 7.8, barHeight: 82 },
];

/**
 * Health Insight screen matching Image 4 (left screen).
 * Shows Week in review cards, sleep quality bar chart with +8% badge, and "Discuss with AI".
 */
export default function HealthInsightsScreen() {
  const theme = useTheme();

  return (
    <Screen
      testID="screen-health-insights"
      contentStyle={{ gap: theme.space[4] }}
      footer={
        <PrimaryButton
          label="Discuss with Arogya AI"
          icon="sparkles"
          onPress={() => router.push('/assistant')}
          style={{ minHeight: 54, borderRadius: 27, backgroundColor: '#0F172A' }}
        />
      }>
      {/* Top Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton
          icon="arrow-back"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          flipInRTL
        />
        <Text variant="h2" weight="bold" style={{ color: '#0F172A' }}>
          Health insight
        </Text>
      </View>

      {/* Week in review top banner */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 22,
          padding: 18,
          borderWidth: 1,
          borderColor: '#E2E8F0',
          gap: 6,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.03,
          shadowRadius: 8,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: '#0F172A',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name="sparkles" size={18} color="#FFFFFF" />
          </View>
          <Text variant="title" weight="bold" style={{ color: '#0F172A' }}>
            Your week in review
          </Text>
        </View>
        <Text variant="bodySmall" tone="secondary" style={{ lineHeight: 22 }}>
          You&apos;re building healthy momentum with consistent hydration and steady sleep routines.
        </Text>
      </View>

      {/* Insight Highlight Cards (Image 4 left) */}
      <View style={{ gap: 12 }}>
        {INSIGHT_ITEMS.map((item) => (
          <View
            key={item.id}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 14,
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              padding: 16,
              borderWidth: 1,
              borderColor: '#F1F5F9',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.03,
              shadowRadius: 6,
            }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: item.iconBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name={item.icon} size={22} color={item.iconColor} />
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="bodyStrong" style={{ color: '#0F172A' }}>
                {item.title}
              </Text>
              <Text variant="bodySmall" tone="secondary" style={{ lineHeight: 20 }}>
                {item.body}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Sleep Quality Section with Weekly Bar Chart (Image 4 left) */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 22,
          padding: 20,
          borderWidth: 1,
          borderColor: '#E2E8F0',
          gap: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
        }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="bed-outline" size={20} color="#0F172A" />
            <Text variant="title" weight="bold">
              Sleep quality
            </Text>
          </View>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 12,
              backgroundColor: '#DCFCE7',
            }}>
            <Text variant="caption" weight="bold" style={{ color: '#16A34A' }}>
              +8%
            </Text>
          </View>
        </View>

        {/* Vertical Bar Chart (Image 4 left) */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            height: 120,
            paddingTop: 16,
            paddingBottom: 4,
          }}>
          {SLEEP_DAYS.map((d) => (
            <View key={d.day} style={{ alignItems: 'center', gap: 8, width: 34 }}>
              <View
                style={{
                  width: 18,
                  height: d.barHeight,
                  borderRadius: 9,
                  backgroundColor: '#0F172A',
                }}
              />
              <Text variant="caption" tone="tertiary" style={{ fontSize: 11 }}>
                {d.day}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

