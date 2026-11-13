// Nutrition scan (Ref A "Viora" upload look). P1 integration screen: the nutrition analyzer belongs
// to P2 (features/patient-ai), who can move this file and its client as-is. All recognition goes
// through features/shared/services/food/client.ts (P2's FoodRecognition shape).
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';

import { analyzeFood, FoodScanError, sendFoodFeedback } from '@/features/shared/services/food/client';
import { DAILY_REFERENCE, clampPortion, hasMacros, macrosForPortion, PORTION_GRAMS } from '@/features/shared/services/food/macros';
import type { FoodItem, FoodScanResult } from '@/features/shared/services/food/types';
import { useTheme } from '@/features/shared/theme';
import {
  Card,
  Heading,
  Icon,
  IconButton,
  Pill,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Skeleton,
  Slider,
  Text,
  TextField,
} from '@/features/shared/ui';

type Photo = { uri: string; mimeType?: string | null; fileName?: string | null };
type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; result: FoodScanResult } | { kind: 'error'; message: string };

export function NutritionScanScreen() {
  const { t } = useTranslation('nutrition');
  const theme = useTheme();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);

  const pick = async (source: 'camera' | 'library') => {
    setNotice(null);
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNotice(t(source === 'camera' ? 'permissionCamera' : 'permissionLibrary'));
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: false };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setPhoto({ uri: a.uri, mimeType: a.mimeType, fileName: a.fileName });
    setStatus({ kind: 'idle' });
  };

  const analyze = async () => {
    if (!photo) return;
    setStatus({ kind: 'loading' });
    try {
      setStatus({ kind: 'done', result: await analyzeFood(photo) });
    } catch (e) {
      const kind = e instanceof FoodScanError ? e.kind : 'server';
      const key = kind === 'bad_image' ? 'errorBadImage' : kind === 'too_large' ? 'errorTooLarge' : kind === 'rate_limited' ? 'errorRateLimited' : 'errorServer';
      setStatus({ kind: 'error', message: t(key) });
    }
  };

  return (
    <Screen background="mist" testID="screen-nutrition" contentStyle={{ gap: theme.space[5] }}>
      {/* Header: back button + centred title (Ref A) */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton icon="arrow-back" variant="glass" flipInRTL accessibilityLabel={t('common:actions.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Heading variant="title" align="center" style={{ flex: 1 }}>
          {t('title')}
        </Heading>
        <View style={{ width: theme.sizes.iconButton }} />
      </View>

      {photo ? (
        <View style={{ gap: theme.space[3] }}>
          <Image source={{ uri: photo.uri }} accessibilityIgnoresInvertColors style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: theme.radii.xl, backgroundColor: theme.colors.surfaceSunken }} />
          <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
            <SecondaryButton label={t('takePhoto')} icon="camera-outline" onPress={() => void pick('camera')} style={{ flex: 1 }} />
            <SecondaryButton label={t('chooseGallery')} icon="images-outline" onPress={() => void pick('library')} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <UploadCard onCamera={() => void pick('camera')} onLibrary={() => void pick('library')} />
      )}

      {notice ? (
        <Text variant="bodySmall" tone="danger" accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}

      <PrimaryButton label={t('analyze')} icon="sparkles" disabled={!photo} loading={status.kind === 'loading'} onPress={() => void analyze()} testID="analyze" />

      {status.kind === 'loading' ? <LoadingCard label={t('analyzing')} /> : null}
      {status.kind === 'error' ? (
        <Card radius="xl" testID="nutrition-error">
          <View style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'center' }}>
            <Icon name="alert-circle" color={theme.colors.status.danger.icon} />
            <Text variant="title" style={{ flex: 1 }}>
              {t('errorTitle')}
            </Text>
          </View>
          <Text tone="secondary">{status.message}</Text>
          <SecondaryButton label={t('retry')} icon="refresh" onPress={() => void analyze()} />
        </Card>
      ) : null}
      {status.kind === 'done' ? <ResultCard result={status.result} /> : null}

      <Text variant="caption" tone="tertiary" align="center">
        {t('disclaimer')}
      </Text>
    </Screen>
  );
}

function UploadCard({ onCamera, onLibrary }: { onCamera: () => void; onLibrary: () => void }) {
  const { t } = useTranslation('nutrition');
  const theme = useTheme();
  return (
    <View
      testID="upload-card"
      style={{
        borderRadius: theme.radii.lg,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: theme.colors.borderDashed,
        backgroundColor: theme.colors.glassFill,
        padding: theme.space[6],
        alignItems: 'center',
        gap: theme.space[3],
      }}>
      <View style={{ width: 56, height: 56, borderRadius: 56, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center', boxShadow: theme.shadows.card.boxShadow }}>
        <Icon name="camera-outline" size={theme.sizes.icon.lg} />
      </View>
      <Text variant="title" align="center">
        {t('uploadTitle')}
      </Text>
      <Text variant="bodySmall" tone="tertiary" align="center">
        {t('uploadBody')}
      </Text>
      <View style={{ alignSelf: 'stretch', gap: theme.space[2], marginTop: theme.space[2] }}>
        <PrimaryButton label={t('takePhoto')} icon="camera" onPress={onCamera} testID="take-photo" />
        <SecondaryButton label={t('chooseGallery')} icon="images-outline" onPress={onLibrary} testID="choose-gallery" />
      </View>
    </View>
  );
}

function LoadingCard({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <Card radius="xl" testID="nutrition-loading">
      <Text variant="bodySmall" tone="secondary" accessibilityLiveRegion="polite">
        {label}
      </Text>
      <Skeleton width="60%" height={24} />
      <Skeleton width="35%" height={16} />
      <View style={{ gap: theme.space[2], marginTop: theme.space[2] }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={12} radius={theme.radii.full} />
        ))}
      </View>
    </Card>
  );
}

/** One result: honest about unrecognised or unreliable answers; portion slider recalculates macros. */
export function ResultCard({ result }: { result: FoodScanResult }) {
  const { t } = useTranslation('nutrition');
  const theme = useTheme();
  const { recognition: r, demo, demoReason } = result;
  const item: FoodItem | undefined = r.items[0];

  return (
    <Card radius="xl" padding="lg" testID="nutrition-result">
      {demo ? (
        <View style={{ gap: theme.space[1] }}>
          <Pill label={t('demoResult')} tone="warning" icon="flask-outline" />
          <Text variant="caption" tone="tertiary">
            {t(demoReason === 'unreachable' ? 'demoOffline' : 'demoUnset')}
          </Text>
        </View>
      ) : null}

      {!item ? (
        <View style={{ gap: theme.space[2] }} testID="not-recognized">
          <Heading variant="h3">{r.isFood ? t('notRecognizedTitle') : t('notFood')}</Heading>
          <Pill label={t('uncertain')} tone="warning" icon="help-circle" />
          {r.notes ? <Text tone="secondary">{r.notes}</Text> : null}
          <Text variant="bodySmall" tone="tertiary">
            {t('notRecognizedBody')}
          </Text>
        </View>
      ) : (
        <ItemDetails key={`${item.name}-${item.estimatedGrams}`} item={item} reliable={r.reliable} source={r.source} notes={r.notes} />
      )}
      <Feedback />
    </Card>
  );
}

function ItemDetails({ item, reliable, source, notes }: { item: FoodItem; reliable: boolean; source: 'vision-llm' | 'dishdetect'; notes: string | null }) {
  const { t } = useTranslation('nutrition');
  const theme = useTheme();
  const [grams, setGrams] = useState(clampPortion(item.estimatedGrams));
  const m = macrosForPortion(item.per100g, grams);
  const known = hasMacros(item.per100g);

  return (
    <View style={{ gap: theme.space[4] }}>
      <View style={{ gap: theme.space[1] }}>
        <Heading variant="h2" lang="en" testID="dish-name">
          {item.name}
        </Heading>
        {item.localName ? <Text tone="secondary">{item.localName}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2], marginTop: theme.space[2] }}>
          <Pill label={reliable ? t('confident') : t('uncertain')} tone={reliable ? 'success' : 'warning'} icon={reliable ? 'checkmark-circle' : 'help-circle'} />
          <Pill label={t('confidence', { value: Math.round(item.confidence * 100) })} tone="neutral" icon="analytics-outline" />
        </View>
      </View>

      {known ? (
        <>
          <View style={{ gap: theme.space[1] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text variant="label">{t('portion')}</Text>
              <Text variant="title" numeric testID="portion-grams">
                {t('portionGrams', { grams })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
              <IconButton icon="remove" accessibilityLabel={t('decrease')} onPress={() => setGrams((g) => clampPortion(g - 25))} />
              <View style={{ flex: 1 }}>
                <Slider
                  value={grams}
                  min={PORTION_GRAMS.min}
                  max={PORTION_GRAMS.max}
                  step={PORTION_GRAMS.step}
                  onChange={setGrams}
                  accessibilityLabel={t('portion')}
                  valueText={t('portionGrams', { grams })}
                  testID="portion-slider"
                />
              </View>
              <IconButton icon="add" accessibilityLabel={t('increase')} onPress={() => setGrams((g) => clampPortion(g + 25))} />
            </View>
            {item.portionDescription ? (
              <Text variant="caption" tone="tertiary" lang="en">
                {item.portionDescription}
              </Text>
            ) : null}
          </View>

          <View style={{ gap: theme.space[3] }}>
            <Text variant="label">{t('macros')}</Text>
            <MacroBar label={t('kcal')} value={m.kcal} unit={t('unitKcal')} frac={m.kcal / DAILY_REFERENCE.kcal} color={theme.colors.chart.series[1]} />
            <MacroBar label={t('protein')} value={m.proteinG} unit={t('unitG')} frac={m.proteinG / DAILY_REFERENCE.proteinG} color={theme.colors.chart.series[0]} />
            <MacroBar label={t('carbs')} value={m.carbsG} unit={t('unitG')} frac={m.carbsG / DAILY_REFERENCE.carbsG} color={theme.colors.chart.series[4]} />
            <MacroBar label={t('fat')} value={m.fatG} unit={t('unitG')} frac={m.fatG / DAILY_REFERENCE.fatG} color={theme.colors.chart.series[3]} />
            <Text variant="caption" tone="tertiary">
              {t('per100', { kcal: item.per100g.kcal, protein: item.per100g.proteinG, carbs: item.per100g.carbsG, fat: item.per100g.fatG })}
            </Text>
            <Pill label={t(source === 'dishdetect' ? 'estimateDishDetect' : 'estimateAi')} tone="info" icon="information-circle" />
          </View>
        </>
      ) : (
        <Text tone="secondary">{t('noNutrition')}</Text>
      )}

      {notes ? (
        <View style={{ gap: theme.space[1] }}>
          <Text variant="label">{t('about')}</Text>
          <Text variant="bodySmall" tone="secondary">
            {notes}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function MacroBar({ label, value, unit, frac, color }: { label: string; value: number; unit: string; frac: number; color: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[1] }} accessible accessibilityLabel={`${label} ${value} ${unit}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="bodySmall">{label}</Text>
        <Text variant="bodySmall" weight="semibold" numeric>
          {`${value} ${unit}`}
        </Text>
      </View>
      <View style={{ height: 10, borderRadius: theme.radii.full, backgroundColor: theme.colors.chart.barGhost, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(Math.min(1, Math.max(0.02, frac)) * 100)}%`, height: '100%', borderRadius: theme.radii.full, backgroundColor: color }} />
      </View>
    </View>
  );
}

function Feedback() {
  const { t } = useTranslation('nutrition');
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  if (done)
    return (
      <Text variant="bodySmall" tone="secondary" accessibilityLiveRegion="polite">
        {t('thanks')}
      </Text>
    );
  if (!open) return <SecondaryButton label={t('wrongDish')} icon="chatbox-ellipses-outline" onPress={() => setOpen(true)} testID="wrong-dish" />;
  return (
    <View style={{ gap: theme.space[2] }}>
      <TextField label={t('wrongDishLabel')} placeholder={t('wrongDishPlaceholder')} value={name} onChangeText={setName} />
      <SecondaryButton
        label={t('send')}
        icon="send"
        disabled={!name.trim()}
        onPress={() => {
          void sendFoodFeedback(name.trim()).finally(() => setDone(true));
        }}
      />
    </View>
  );
}
