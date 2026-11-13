import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch, View } from 'react-native';

import { REPORT_CATEGORIES } from '@am/records';

import { StatCards, formatWhen } from '@/features/health/HistoryView';
import { usePatientHistory } from '@/features/health/useHistory';
import { useRecords } from '@/features/shared/data/recordsStore';
import { useTheme } from '@/features/shared/theme';
import { Card, EmptyState, Heading, Icon, Pill, Screen, SectionHeader, ServiceTile, Skeleton, Text, type IconName, type TileTint } from '@/features/shared/ui';

const LINKS: { id: 'qr' | 'history' | 'reports' | 'bloodBanks' | 'hospital'; icon: IconName; tint: TileTint; href: '/qr-card' | '/history' | '/upload-report' | '/blood-banks' | '/hospital' }[] = [
  { id: 'qr', icon: 'qr-code', tint: 'blue', href: '/qr-card' },
  { id: 'history', icon: 'time', tint: 'mint', href: '/history' },
  { id: 'reports', icon: 'folder-open', tint: 'lavender', href: '/upload-report' },
  { id: 'bloodBanks', icon: 'water', tint: 'pink', href: '/blood-banks' },
  { id: 'hospital', icon: 'map', tint: 'butter', href: '/hospital' },
];

const CATEGORY_ICON: Record<string, IconName> = { blood_test: 'water-outline', cardiology: 'heart-outline', prescription: 'receipt-outline', imaging: 'scan-outline', xray: 'bandage-outline' };

/** Health hub: vitals at a glance, the patient's records tools, recent reports and the Share history switch. */
export default function PatientHealth() {
  const { t, i18n } = useTranslation('health');
  const theme = useTheme();
  const history = usePatientHistory();
  const reports = useRecords((s) => s.reports);
  const shareHistory = useRecords((s) => s.shareHistory);
  const setShareHistory = useRecords((s) => s.setShareHistory);

  return (
    <Screen withTabBar testID="screen-patient-health" contentStyle={{ gap: theme.space[5] }}>
      <View style={{ gap: theme.space[1] }}>
        <Heading variant="h1">{t('hub.title')}</Heading>
        <View style={{ flexDirection: 'row', gap: theme.space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <Text tone="secondary" style={{ flexShrink: 1 }}>
            {t('hub.subtitle')}
          </Text>
          <Pill label={t('common:demo.badge')} tone="warning" icon="flask-outline" />
        </View>
      </View>

      {history ? (
        <StatCards cards={history.statCards} testID="hub-stats" />
      ) : (
        <View style={{ gap: theme.space[3] }} testID="hub-loading">
          <Skeleton height={96} radius={theme.radii.xl} />
          <Skeleton height={96} radius={theme.radii.xl} />
        </View>
      )}

      {history?.alerts.openRiskAlerts.length ? (
        <Card tone="muted" radius="xl" padding="lg" testID="hub-risk">
          <View style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'flex-start' }}>
            <Icon name="alert-circle" size={theme.sizes.icon.md} color={theme.colors.status.danger.icon} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">{t('hub.openAlert')}</Text>
              <Text variant="bodySmall" tone="secondary">
                {history.alerts.openRiskAlerts[0].reason}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('hub.tools')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: theme.space[4] }}>
          {LINKS.map((l) => (
            <View key={l.id} style={{ width: '33.333%', paddingHorizontal: theme.space[1] }}>
              <ServiceTile label={t(`hub.links.${l.id}`)} icon={l.icon} tint={l.tint} onPress={() => router.push(l.href)} testID={`hub-link-${l.id}`} />
            </View>
          ))}
        </View>
      </View>

      <Card radius="xl" padding="lg" testID="hub-share">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{t('hub.share.title')}</Text>
            <Text variant="bodySmall" tone="secondary">
              {shareHistory ? t('hub.share.on') : t('hub.share.off')}
            </Text>
          </View>
          <Switch value={shareHistory} onValueChange={setShareHistory} accessibilityLabel={t('hub.share.title')} trackColor={{ true: theme.accent.accent, false: theme.colors.border }} testID="share-switch" />
        </View>
      </Card>

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('hub.recentReports')} actionLabel={t('hub.upload')} onAction={() => router.push('/upload-report')} />
        {reports.length === 0 ? (
          <EmptyState icon="folder-open-outline" title={t('reports.emptyTitle')} body={t('reports.emptyBody')} testID="reports-empty" />
        ) : (
          <View style={{ gap: theme.space[2] }} testID="reports-list">
            {reports.slice(0, 5).map((r) => (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={`${r.title}, ${t(`category.${r.category}`)}`}
                onPress={() => router.push('/history')}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
                <Card radius="lg" padding="md">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
                    <View style={{ width: 44, height: 44, borderRadius: theme.radii.md, backgroundColor: theme.accent.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={CATEGORY_ICON[r.category] ?? 'document-text-outline'} size={theme.sizes.icon.sm} color={theme.accent.accentIcon} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {r.title}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        {`${t(`category.${r.category}`)} · ${formatWhen(r.reportDate ?? r.createdAt, i18n.language)} · ${(r.sizeBytes / 1_048_576).toFixed(1)} MB`}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={theme.sizes.icon.sm} color={theme.colors.textTertiary} flipInRTL />
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
        <Text variant="caption" tone="tertiary">
          {t('reports.categoriesHint', { list: REPORT_CATEGORIES.map((c) => t(`category.${c.key}`)).join(', ') })}
        </Text>
      </View>
    </Screen>
  );
}
