import { TextInput, View, Platform } from 'react-native';

import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';

import { Icon } from './Icon';
import { fontFor } from './Text';

export type SearchBarProps = {
  placeholder: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmit?: () => void;
  testID?: string;
};

/** Rounded search field with a leading search icon. */
export function SearchBar({ placeholder, value, onChangeText, onSubmit, testID }: SearchBarProps) {
  const t = useTheme();
  const { meta } = useLanguage();
  const { maxFontSizeMultiplier, ...font } = fontFor('body', meta.script, 'regular', t.textScale);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.space[2],
        minHeight: t.sizes.button.lg,
        paddingHorizontal: t.space[4],
        borderRadius: t.radii.full,
        backgroundColor: t.colors.surface,
        borderWidth: 1,
        borderColor: t.colors.border,
      }}>
      <Icon name="search" size={t.sizes.icon.sm} color={t.colors.textTertiary} />
      <TextInput
        testID={testID}
        accessibilityLabel={placeholder}
        placeholder={placeholder}
        placeholderTextColor={t.colors.textTertiary}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={[
          font,
          { flex: 1, color: t.colors.textPrimary, paddingVertical: t.space[3] },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
      />
    </View>
  );
}
