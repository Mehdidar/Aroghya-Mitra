/** The current language as a chip in the header; tapping opens a sheet with all seven. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LANGUAGES, LANGUAGE_CODES } from '@/features/shared/i18n/languages';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';
import { Icon, Text } from '@/features/shared/ui';

export function LanguageChip() {
  const { t } = useTranslation('patient');
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, meta, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('lang.change', { current: `${meta.native}, ${meta.english}` })}
        onPress={() => setOpen(true)}
        testID="language-chip"
        hitSlop={6}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[1],
          minHeight: theme.sizes.touchMin,
          paddingHorizontal: theme.space[3],
          borderRadius: theme.radii.full,
          backgroundColor: theme.colors.surfaceSunken,
          opacity: pressed ? 0.8 : 1,
        })}>
        <Icon name="language" size={18} color={theme.colors.textSecondary} />
        <Text variant="label" weight="semibold" lang={language} numberOfLines={1}>
          {meta.native}
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('lang.close')} onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} />
        <View style={{ backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radii.xl, borderTopRightRadius: theme.radii.xl, paddingTop: theme.space[4], paddingBottom: insets.bottom + theme.space[4], maxHeight: '75%' }}>
          <Text variant="title" style={{ paddingHorizontal: theme.space[5], marginBottom: theme.space[2] }} accessibilityRole="header">
            {t('lang.title')}
          </Text>
          <ScrollView contentContainerStyle={{ paddingHorizontal: theme.space[4], gap: theme.space[2] }} role="radiogroup">
            {LANGUAGE_CODES.map((code) => {
              const m = LANGUAGES[code];
              const selected = code === language;
              return (
                <Pressable
                  key={code}
                  role="radio"
                  aria-checked={selected}
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${m.native}, ${m.english}`}
                  testID={`language-option-${code}`}
                  onPress={() => {
                    void setLanguage(code);
                    setOpen(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.space[3],
                    minHeight: 56,
                    paddingHorizontal: theme.space[4],
                    borderRadius: theme.radii.lg,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? theme.accent.accent : theme.colors.border,
                  }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" lang={code}>
                      {m.native}
                    </Text>
                    <Text variant="caption" tone="tertiary" lang="en">
                      {m.english}
                    </Text>
                  </View>
                  {selected ? <Icon name="checkmark-circle" color={theme.accent.accent} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
