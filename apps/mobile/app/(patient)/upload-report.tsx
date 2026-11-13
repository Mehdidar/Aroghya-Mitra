import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { REPORT_CATEGORIES, defaultTitle, progressPercent, reportStoragePath, resolveMime, validateUpload, type PickedFile, type ReportCategory, type UploadValidationError } from '@am/records';
import { DEMO_IDS, type HealthReport } from '@am/shared';

import { useRecords } from '@/features/shared/data/recordsStore';
import { currentPatientId, useSession } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Card, Heading, Icon, IconButton, Pill, PrimaryButton, Screen, SectionHeader, Text, TextField, type IconName } from '@/features/shared/ui';

const CATEGORY_ICON: Record<ReportCategory, IconName> = { blood_test: 'water-outline', cardiology: 'heart-outline', prescription: 'receipt-outline', imaging: 'scan-outline', xray: 'bandage-outline' };

type Picked = PickedFile & { uri: string | null };

/**
 * Upload a health report: pick a photo or PDF, choose a category, name it,
 * then it is validated with the shared upload rules and saved to the local
 * records store (demo storage; the same path shape the server bucket uses).
 */
export default function UploadHealthReport() {
  const { t } = useTranslation('health');
  const theme = useTheme();
  const addReport = useRecords((s) => s.addReport);
  const [file, setFile] = useState<Picked | null>(null);
  const [category, setCategory] = useState<ReportCategory | null>('blood_test');
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState<UploadValidationError[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [saved, setSaved] = useState<HealthReport | null>(null);

  const pick = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const picked: Picked = { name: a.fileName || 'report.jpg', mimeType: a.mimeType ?? null, sizeBytes: a.fileSize ?? 0, uri: a.uri };
      setFile(picked);
      if (!title) setTitle(defaultTitle(picked.name));
      setErrors([]);
    } catch {
      setErrors(['unsupported_type']);
    }
  };

  const save = () => {
    if (!file) return;
    const errs = validateUpload({ file, category, title });
    setErrors(errs);
    if (errs.length) return;
    const mime = resolveMime(file)!;
    const id = `rep-${Date.now()}`;
    const total = file.sizeBytes || 1;
    let sent = 0;
    setProgress(0);
    const tick = setInterval(() => {
      sent = Math.min(total, sent + total / 5);
      setProgress(progressPercent(sent, total));
      if (sent >= total) {
        clearInterval(tick);
        const report: HealthReport = {
          id,
          patientId: currentPatientId(),
          uploadedBy: useSession.getState().currentUserId() ?? DEMO_IDS.patient,
          category: category!,
          title: title.trim(),
          storagePath: reportStoragePath(currentPatientId(), mime, id),
          mimeType: mime,
          sizeBytes: file.sizeBytes,
          reportDate: new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
        };
        addReport(report);
        setSaved(report);
      }
    }, 120);
  };

  return (
    <Screen
      testID="screen-upload-health-report"
      contentStyle={{ gap: theme.space[4] }}
      footer={
        saved ? (
          <PrimaryButton label={t('upload.done')} icon="checkmark" onPress={() => router.replace('/health')} testID="upload-done" />
        ) : (
          <PrimaryButton label={progress !== null && progress < 100 ? t('upload.saving') : t('upload.save')} icon="cloud-upload-outline" onPress={save} disabled={!file || (progress !== null && progress < 100)} loading={progress !== null && progress < 100} testID="upload-save" />
        )
      }>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="arrow-back" accessibilityLabel={t('common:actions.back', { defaultValue: 'Back' })} onPress={() => (router.canGoBack() ? router.back() : router.replace('/health'))} flipInRTL />
        <Heading variant="h2">{t('upload.title')}</Heading>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel={t('upload.pick')} onPress={pick} testID="upload-pick">
        <View style={{ borderWidth: 1.5, borderColor: theme.colors.border, borderStyle: 'dashed', borderRadius: theme.radii.xl, padding: theme.space[6], backgroundColor: theme.colors.surfaceMuted, alignItems: 'center', gap: theme.space[3] }}>
          <View style={{ width: 58, height: 58, borderRadius: theme.radii.full, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arrow-up" size={theme.sizes.icon.md} color={theme.colors.textPrimary} />
          </View>
          <Text variant="bodyStrong">{t('upload.pick')}</Text>
          <Text variant="caption" tone="tertiary" align="center">
            {t('upload.pickHint')}
          </Text>
          {file ? (
            <Card radius="lg" padding="md" style={{ width: '100%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
                <View style={{ width: 38, height: 38, borderRadius: theme.radii.sm, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="document-text" size={theme.sizes.icon.sm} color={theme.colors.onPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySmall" weight="semibold" numberOfLines={1} testID="upload-filename">
                    {file.name}
                  </Text>
                  <Text variant="caption" tone="tertiary" numeric>
                    {`${(file.sizeBytes / 1_048_576).toFixed(1)} MB`}
                  </Text>
                </View>
                {progress !== null ? (
                  <Text variant="caption" weight="bold" numeric testID="upload-progress">
                    {`${progress}%`}
                  </Text>
                ) : null}
              </View>
              {progress !== null ? (
                <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.chart.barGhost, overflow: 'hidden', marginTop: theme.space[2] }}>
                  <View style={{ height: '100%', width: `${progress}%`, backgroundColor: theme.colors.primary }} />
                </View>
              ) : null}
            </Card>
          ) : null}
        </View>
      </Pressable>

      <TextField label={t('upload.name')} value={title} onChangeText={setTitle} placeholder={t('upload.namePlaceholder')} error={errors.includes('no_title') ? t('upload.errors.no_title') : undefined} testID="upload-title" />

      <View style={{ gap: theme.space[3] }}>
        <SectionHeader title={t('upload.category')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {REPORT_CATEGORIES.map((c) => {
            const selected = category === c.key;
            return (
              <Pressable
                key={c.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCategory(c.key)}
                testID={`category-${c.key}`}
                style={{ width: '47%', flexGrow: 1, minHeight: theme.sizes.touchMin, padding: theme.space[3], borderRadius: theme.radii.lg, backgroundColor: theme.colors.surface, borderWidth: 1.5, borderColor: selected ? theme.colors.primary : theme.colors.border, flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
                <Icon name={CATEGORY_ICON[c.key]} size={theme.sizes.icon.sm} color={theme.colors.textPrimary} />
                <Text variant="bodySmall" weight="semibold">
                  {t(`category.${c.key}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {errors.filter((e) => e !== 'no_title').length ? (
        <Card tone="muted" radius="lg" padding="md" testID="upload-errors">
          {errors
            .filter((e) => e !== 'no_title')
            .map((e) => (
              <Text key={e} variant="bodySmall" color={theme.colors.status.danger.fg}>
                {t(`upload.errors.${e}`)}
              </Text>
            ))}
        </Card>
      ) : null}

      {saved ? (
        <Card tone="accent" radius="xl" padding="lg" testID="upload-saved">
          <View style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'center' }}>
            <Icon name="checkmark-circle" size={theme.sizes.icon.md} color={theme.accent.accentIcon} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{t('upload.savedTitle')}</Text>
              <Text variant="bodySmall" tone="secondary">
                {t('upload.savedBody', { title: saved.title })}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      <Pill label={t('upload.demoStorage')} tone="warning" icon="flask-outline" />
    </Screen>
  );
}
