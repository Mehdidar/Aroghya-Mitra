import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RiskLevel } from '../types';

export const colors = {
  bg: '#F5F7F6',
  card: '#FFFFFF',
  text: '#17211D',
  muted: '#5C6B65',
  border: '#DCE3E0',
  primary: '#0B7A5C',
  primaryText: '#FFFFFF',
  danger: '#B42318',
  chip: '#EAF2EF',
  risk: {
    none: { bg: '#E7F5EE', fg: '#146C43' },
    low: { bg: '#EEF4FF', fg: '#2453A6' },
    medium: { bg: '#FFF4DB', fg: '#8A5A00' },
    high: { bg: '#FDE7DC', fg: '#B54708' },
    critical: { bg: '#FBE2E1', fg: '#B42318' },
  } as Record<RiskLevel, { bg: string; fg: string }>,
};

export function Screen({ children, scroll = true, footer }: { children: React.ReactNode; scroll?: boolean; footer?: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screenBody} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screenBody, { flex: 1 }]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function H({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.card;
  const fg = variant === 'secondary' ? colors.primary : colors.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && { borderWidth: 1.5, borderColor: colors.primary },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, tone }: { label: string; selected?: boolean; onPress?: () => void; tone?: 'danger' }) {
  const selBg = tone === 'danger' ? colors.danger : colors.primary;
  return (
    <Pressable
      accessibilityRole={onPress ? 'checkbox' : undefined}
      accessibilityState={{ checked: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: selBg, borderColor: selBg }]}
    >
      <Text style={[styles.chipText, selected && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function RiskBadge({ level, label }: { level: RiskLevel; label: string }) {
  const c = colors.risk[level];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function Field({ label, error, style, ...input }: TextInputProps & { label: string; error?: boolean }) {
  return (
    <View style={[styles.field, style as object]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...input}
        style={[styles.input, error && { borderColor: colors.danger, borderWidth: 2 }, input.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
      />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenBody: { padding: 16, gap: 12, paddingBottom: 32 },
  footer: { padding: 16, paddingTop: 8, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 8 },
  h: { fontSize: 17, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  button: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.chip, borderWidth: 1, borderColor: colors.border },
  chipText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  field: { gap: 4, flexGrow: 1, flexBasis: 140 },
  label: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: '#fff', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
