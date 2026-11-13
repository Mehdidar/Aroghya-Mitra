// Prescription explainer: photo -> server extraction -> editable medicine cards -> reminders.
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';


import { MedicineCard } from '@/features/patient/prescription/MedicineCard';
import { extractPrescription, PrescriptionScanError, type PrescriptionImage } from '@/features/patient/prescription/client';
import { scheduleDoseNotifications } from '@/features/patient/prescription/notifications';
import { toPrescription, toReminderItems } from '@/features/patient/prescription/toReminders';
import { toReviewed, type ExtractResponse, type ReviewedMedicine } from '@/features/patient/prescription/types';
import { useRecords } from '@/features/shared/data/recordsStore';
import { currentPatientId } from '@/features/shared/state/session';
import { useTheme } from '@/features/shared/theme';
import { Card, ErrorState, Heading, Icon, IconButton, Pill, PrimaryButton, Screen, SecondaryButton, Skeleton, Text } from '@/features/shared/ui';

type Step = { kind: 'pick' } | { kind: 'analyzing' } | { kind: 'review'; result: ExtractResponse; meds: ReviewedMedicine[] } | { kind: 'saved'; scheduled: number; notif: string } | { kind: 'error'; message: string };

export default function PrescriptionExplainer() {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const [photo, setPhoto] = useState<PrescriptionImage | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [notice, setNotice] = useState<string | null>(null);
  const addPrescription = useRecords((s) => s.addPrescription);

  const pick = async (source: 'camera' | 'library') => {
    setNotice(null);
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setNotice(t(source === 'camera' ? 'prescription.permissionCamera' : 'prescription.permissionLibrary'));
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const img = { uri: a.uri, mimeType: a.mimeType, fileName: a.fileName };
    setPhoto(img);
    await analyze(img);
  };

  const analyze = async (img: PrescriptionImage) => {
    setStep({ kind: 'analyzing' });
    try {
      const result = await extractPrescription(img);
      if (!result.prescription.isPrescription) return setStep({ kind: 'error', message: t('prescription.notAPrescription') });
      setStep({ kind: 'review', result, meds: result.prescription.medicines.map(toReviewed) });
    } catch (e) {
      const kind = e instanceof PrescriptionScanError ? e.kind : 'server';
      setStep({ kind: 'error', message: t(`prescription.errors.${kind}`) });
    }
  };

  const save = async () => {
    if (step.kind !== 'review') return;
    const meds = step.meds.filter((m) => m.name.trim());
    const rx = toPrescription(meds, currentPatientId());
    const items = toReminderItems(meds, rx.id);
    addPrescription(rx, items);
    const copy = { channelName: t('reminders:notifChannel'), taken: t('reminders:taken'), skip: t('reminders:skip'), title: () => t('reminders:notifTitle'), body: (names: string[]) => names.join(', ') };
    const out = await scheduleDoseNotifications(items, copy);
    setStep({ kind: 'saved', scheduled: out.scheduled, notif: out.state });
  };

  return (
    <Screen background="mist" testID="screen-prescription" contentStyle={{ gap: theme.space[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <IconButton icon="chevron-back" flipInRTL accessibilityLabel={t('chat.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1 }}>
          <Heading variant="h2">{t('prescription.title')}</Heading>
          <Text variant="caption" tone="secondary">
            {t('prescription.intro')}
          </Text>
        </View>
      </View>

      {step.kind === 'pick' ? (
        <Card radius="xl" padding="lg">
          <View style={{ alignItems: 'center', gap: theme.space[3] }}>
            <View style={{ width: 88, height: 88, borderRadius: theme.radii.xl, backgroundColor: theme.accent.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="document-text" size={theme.sizes.icon.xl} color={theme.accent.accentIcon} />
            </View>
            <Text align="center" tone="secondary">
              {t('prescription.pickBody')}
            </Text>
            <PrimaryButton label={t('prescription.takePhoto')} icon="camera" onPress={() => void pick('camera')} testID="rx-camera" />
            <SecondaryButton label={t('prescription.choose')} icon="images" onPress={() => void pick('library')} testID="rx-gallery" />
            {notice ? <Pill label={notice} tone="warning" icon="alert-circle-outline" /> : null}
          </View>
        </Card>
      ) : null}

      {photo && step.kind !== 'pick' ? <Image source={{ uri: photo.uri }} accessibilityIgnoresInvertColors style={{ width: '100%', height: 160, borderRadius: theme.radii.xl }} resizeMode="cover" /> : null}

      {step.kind === 'analyzing' ? (
        <Card radius="xl" padding="lg" testID="rx-analyzing">
          <View style={{ gap: theme.space[2] }}>
            <Text variant="title">{t('prescription.analyzing')}</Text>
            <Skeleton height={14} />
            <Skeleton height={14} width="80%" />
            <Skeleton height={14} width="60%" />
          </View>
        </Card>
      ) : null}

      {step.kind === 'error' ? <ErrorState title={t('prescription.errorTitle')} body={step.message} retryLabel={t('prescription.retake')} onRetry={() => setStep({ kind: 'pick' })} /> : null}

      {step.kind === 'review' ? (
        <>
          {step.result.demo ? (
            <View style={{ gap: theme.space[1] }}>
              <Pill label={t('prescription.demoPill')} tone="warning" icon="flask-outline" />
              <Text variant="caption" tone="tertiary">
                {t(`prescription.demoReason.${step.result.reason ?? 'no_vision_model'}`)}
              </Text>
            </View>
          ) : null}
          {step.result.prescription.doctorName.value || step.result.prescription.clinicName.value ? (
            <Text variant="bodySmall" tone="secondary" lang="en">
              {[step.result.prescription.doctorName.value, step.result.prescription.clinicName.value, step.result.prescription.date.value].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {step.meds.length === 0 ? <Text tone="secondary">{t('prescription.noMedicines')}</Text> : null}
          {step.meds.map((m) => (
            <MedicineCard key={m.key} med={m} onChange={(nm) => setStep({ ...step, meds: step.meds.map((x) => (x.key === nm.key ? nm : x)) })} onRemove={() => setStep({ ...step, meds: step.meds.filter((x) => x.key !== m.key) })} />
          ))}
          <Text variant="caption" tone="tertiary">
            {t('prescription.disclaimer')}
          </Text>
          <PrimaryButton label={t('prescription.setReminders')} icon="alarm" onPress={() => void save()} disabled={!step.meds.some((m) => m.name.trim())} testID="rx-save" />
          <SecondaryButton label={t('prescription.retake')} icon="camera" onPress={() => setStep({ kind: 'pick' })} />
        </>
      ) : null}

      {step.kind === 'saved' ? (
        <Card radius="xl" padding="lg" tone="accent" testID="rx-saved">
          <View style={{ gap: theme.space[2] }}>
            <Heading variant="h3">{t('prescription.savedTitle')}</Heading>
            <Text tone="secondary">{t(`prescription.notif.${step.notif}`, { n: step.scheduled })}</Text>
            <PrimaryButton label={t('prescription.goReminders')} icon="alarm" onPress={() => router.replace('/reminders')} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
