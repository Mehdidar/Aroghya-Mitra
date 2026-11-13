import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export type IconProps = {
  name: IconName;
  size?: number;
  /** A colour value from useTheme(). Defaults to textPrimary. */
  color?: string;
  /** Mirror in right-to-left languages (back, chevron, arrow, send). Never for heart, clock, search. */
  flipInRTL?: boolean;
};

/** Ionicons (bundled with @expo/vector-icons). Decorative by default: pair it with a text label. */
export function Icon({ name, size, color, flipInRTL }: IconProps) {
  const theme = useTheme();
  const { isRTL } = useLanguage();
  return (
    <Ionicons
      name={name}
      size={size ?? theme.sizes.icon.md}
      color={color ?? theme.colors.textPrimary}
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={flipInRTL && isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
    />
  );
}
