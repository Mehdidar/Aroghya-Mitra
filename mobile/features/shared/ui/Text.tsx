// The only text component in the app. It applies the font family for the string's script (Manrope
// for Latin, Noto for Indic, Noto Naskh Arabic for Urdu/Kashmiri), the per-script line height, the
// user's text scale and theme colours. Never import Text from react-native in feature code.
import { Children, type ReactNode } from 'react';
import {
  Platform,
  Text as RNText,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { LANGUAGES, detectScript, type LanguageCode, type Script } from '@/features/shared/i18n/languages';
import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { fontFamily, scriptMetrics, typography, useTheme, type Theme } from '@/features/shared/theme';

export type TypographyStep = keyof typeof typography;
export type Weight = keyof (typeof fontFamily)['latn'];
export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'disabled'
  | 'inverse'
  | 'inverseSecondary'
  | 'accent'
  | 'onAccent'
  | 'danger'
  | 'onPrimary';

export type TextProps = Omit<RNTextProps, 'style'> & {
  variant?: TypographyStep;
  weight?: Weight;
  tone?: TextTone;
  /** Explicit colour token value (from useTheme()), for the rare case a tone does not fit. */
  color?: string;
  align?: 'start' | 'center' | 'end';
  /** Language of the content when it differs from the UI language. */
  lang?: LanguageCode;
  /** Digits, phone numbers, vitals, IDs: Latin font, tabular, always left-to-right. */
  numeric?: boolean;
  children?: ReactNode;
  style?: StyleProp<TextStyle>;
};

const WEIGHT_OF: Record<string, Weight> = { '400': 'regular', '500': 'medium', '600': 'semibold', '700': 'bold' };
const RLM = '‏';
const LRI = '⁦';
const PDI = '⁩';

function toneColor(theme: Theme, tone: TextTone): string {
  const { colors, accent } = theme;
  switch (tone) {
    case 'secondary':
      return colors.textSecondary;
    case 'tertiary':
      return colors.textTertiary;
    case 'disabled':
      return colors.textDisabled;
    case 'inverse':
      return colors.textOnDark;
    case 'inverseSecondary':
      return colors.textOnDarkSecondary;
    case 'accent':
      return accent.accentText;
    case 'onAccent':
      return accent.onAccent;
    case 'danger':
      return colors.status.danger.fg;
    case 'onPrimary':
      return colors.onPrimary;
    default:
      return colors.textPrimary;
  }
}

/** Font size, line height and family for one typography step in one script. */
export function fontFor(step: TypographyStep, script: Script, weight: Weight | undefined, scale: number) {
  const t = typography[step];
  const m = scriptMetrics[script];
  const fontSize = Math.round(t.size * m.sizeMult * scale);
  const lineHeight = Math.ceil(Math.max(t.line * m.lineMult * scale, fontSize * m.natural));
  const w = weight ?? WEIGHT_OF[t.weight] ?? 'regular';
  return {
    fontFamily: fontFamily[script][w],
    fontSize,
    lineHeight,
    letterSpacing: script === 'latn' ? t.tracking : 0,
    maxFontSizeMultiplier: t.maxScale,
  };
}

export function Text({
  variant = 'body',
  weight,
  tone = 'primary',
  color,
  align = 'start',
  lang,
  numeric,
  children,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const ui = useLanguage();
  const contentLang = lang ?? ui.language;
  const meta = LANGUAGES[contentLang];

  const plain = Children.toArray(children).every((c) => typeof c === 'string' || typeof c === 'number');
  const str = plain ? Children.toArray(children).join('') : '';
  const script: Script = numeric ? 'latn' : (plain && detectScript(str)) || meta.script;
  const rtl = !numeric && (meta.dir === 'rtl' || script === 'arab');

  const { maxFontSizeMultiplier, ...font } = fontFor(variant, script, weight, theme.textScale);

  let content: ReactNode = children;
  if (plain && numeric) content = `${LRI}${str}${PDI}`;
  else if (plain && rtl && str && detectScript(str) !== 'arab') content = `${RLM}${str}`;

  const textAlign: TextStyle['textAlign'] =
    align === 'center' ? 'center' : align === 'end' ? (Platform.OS === 'web' ? ('end' as never) : 'right') : undefined;

  const webProps = Platform.OS === 'web' ? ({ lang: meta.bcp47, dir: numeric ? 'ltr' : rtl ? 'rtl' : 'auto' } as object) : {};

  return (
    <RNText
      {...webProps}
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        font,
        { color: color ?? toneColor(theme, tone) },
        textAlign ? { textAlign } : null,
        Platform.OS === 'ios' ? { writingDirection: numeric ? 'ltr' : rtl ? 'rtl' : 'auto' } : null,
        numeric ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}>
      {content}
    </RNText>
  );
}

/** A heading: Text with accessibilityRole "header" and a heading variant. */
export function Heading({ variant = 'h2', ...props }: TextProps) {
  return <Text accessibilityRole="header" variant={variant} {...props} />;
}
