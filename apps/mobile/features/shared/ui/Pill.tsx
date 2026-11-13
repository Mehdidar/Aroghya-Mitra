import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/features/shared/theme';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

export type PillProps = {
  label: string;
  tone?: PillTone;
  /** 'tinted' (default: pale fill + dark text) or 'solid' (deep fill + white bold text). */
  variant?: 'tinted' | 'solid';
  /** Every status pill should carry an icon so colour is never the only signal. */
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
};

/** Small rounded status badge: green "OPTIMAL", blue "Follow-up visit", red "High risk". */
export function Pill({ label, tone = 'neutral', variant = 'tinted', icon, style }: PillProps) {
  const t = useTheme();
  const s =
    tone === 'accent'
      ? { bg: t.accent.accentSoft, fg: t.accent.accentSoftText, solid: t.accent.accent, icon: t.accent.accentIcon }
      : t.colors.status[tone];
  const solid = variant === 'solid';
  const fg = solid ? t.colors.status.onSolid : s.fg;
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space[1],
          minHeight: t.sizes.pill,
          paddingHorizontal: t.space[3],
          borderRadius: t.radii.full,
          backgroundColor: solid ? s.solid : s.bg,
        },
        style,
      ]}>
      {icon ? <Icon name={icon} size={t.sizes.icon.xs} color={solid ? fg : s.icon} /> : null}
      <Text variant="pill" color={fg}>
        {label}
      </Text>
    </View>
  );
}
