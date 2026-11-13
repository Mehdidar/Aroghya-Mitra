/**
 * "Food preferences" for the health assistant: what I eat (veg / non-veg /
 * vegan / Jain), no onion or garlic, and foods I avoid. Saved on the phone and
 * sent with every chat question so food advice fits the patient.
 *
 * Drop it on any screen: <DietPreferences /> (a self-contained Card).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch, View } from 'react-native';

import { useTheme } from '@/features/shared/theme';
import { Card, Heading, Icon, Text, TextField } from '@/features/shared/ui';

import { DIET_TYPES, useDietPreferences, type DietType } from './preferences';

export function DietPreferences({ testID = 'diet-preferences' }: { testID?: string }) {
  const { t } = useTranslation('assistant');
  const theme = useTheme();
  const { dietType, noOnionGarlic, avoid, setDietType, setNoOnionGarlic, setAvoidText } = useDietPreferences();
  // The list is edited as free text and parsed when the field is left, so typing "brinjal, " keeps the comma.
  const [avoidText, setAvoidState] = useState(avoid.join(', '));
  const latest = useRef(avoidText);
  const setLocalAvoid = (text: string) => {
    latest.current = text;
    setAvoidState(text);
  };
  useEffect(() => {
    latest.current = avoid.join(', ');
    setAvoidState(latest.current);
  }, [avoid]);

  const options: (DietType | null)[] = [null, ...DIET_TYPES];
  const commit = () => setAvoidText(latest.current);

  return (
    <Card radius="xl" padding="lg" testID={testID}>
      <View style={{ gap: theme.space[1] }}>
        <Heading variant="h3">{t('diet.title')}</Heading>
        <Text variant="bodySmall" tone="secondary">
          {t('diet.body')}
        </Text>
      </View>

      <View style={{ gap: theme.space[2] }}>
        <Text variant="label" tone="secondary">
          {t('diet.typeLabel')}
        </Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('diet.typeLabel')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {options.map((o) => {
            const selected = dietType === o;
            const label = t(`diet.type.${o ?? 'none'}`);
            return (
              <Pressable
                key={o ?? 'none'}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                accessibilityLabel={label}
                onPress={() => setDietType(o)}
                testID={`diet-type-${o ?? 'none'}`}
                style={({ pressed }) => ({
                  minHeight: 48,
                  paddingHorizontal: theme.space[4],
                  borderRadius: theme.radii.full,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space[1],
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? theme.accent.accent : theme.colors.border,
                  backgroundColor: selected ? theme.accent.accentSoft : theme.colors.surface,
                  opacity: pressed ? 0.8 : 1,
                })}>
                {selected ? <Icon name="checkmark" size={theme.sizes.icon.sm} color={theme.accent.accentIcon} /> : null}
                <Text variant="label" color={selected ? theme.accent.accentSoftText : undefined}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3], minHeight: 48 }}>
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {t('diet.noOnionGarlic')}
        </Text>
        <Switch
          value={noOnionGarlic}
          onValueChange={setNoOnionGarlic}
          accessibilityLabel={t('diet.noOnionGarlic')}
          trackColor={{ true: theme.accent.accent, false: theme.colors.border }}
          testID="diet-no-onion-garlic"
        />
      </View>

      <TextField
        label={t('diet.avoidLabel')}
        placeholder={t('diet.avoidPlaceholder')}
        hint={t('diet.avoidHint')}
        value={avoidText}
        onChangeText={setLocalAvoid}
        onBlur={commit}
        onSubmitEditing={commit}
        returnKeyType="done"
        testID="diet-avoid"
      />
    </Card>
  );
}
