import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFabInset } from './fabInset';

import { useTheme } from '@/features/shared/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Scrolls by default. Pass false for full-screen layouts that manage their own space. */
  scroll?: boolean;
  /** 'page' (off-white), 'surface' (white), 'hero' (role hero gradient), 'mist' (blue-grey gradient). */
  background?: 'page' | 'surface' | 'hero' | 'mist';
  /** Extra bottom padding so content clears the floating tab bar. */
  withTabBar?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  testID?: string;
};

/** Page wrapper: safe areas, background, max content width (web/tablet) and screen padding. */
export function Screen({
  children,
  scroll = true,
  background = 'page',
  withTabBar,
  padded = true,
  contentStyle,
  footer,
  testID,
}: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const bg: ViewStyle =
    background === 'surface'
      ? { backgroundColor: t.colors.surface }
      : background === 'hero'
        ? { backgroundColor: t.colors.surface, backgroundImage: t.gradient(t.accent.heroGradient, t.accent.heroGradientLocations) }
        : background === 'mist'
          ? { backgroundColor: t.colors.glassFallback, backgroundImage: t.gradient(t.colors.mistGradient) }
          : { backgroundColor: t.colors.page };
  const fab = useFabInset();
  const bottom = withTabBar
    ? t.sizes.tabBar.height + t.sizes.tabBar.marginBottom + insets.bottom + t.space[6] + fab
    : insets.bottom + t.space[6] + fab;
  const inner: StyleProp<ViewStyle> = [
    styles.inner,
    { maxWidth: t.layout.maxContentWidth, paddingTop: insets.top + t.space[3], paddingBottom: footer ? t.space[4] : bottom },
    padded && { paddingHorizontal: t.layout.screenPaddingX },
    contentStyle,
  ];
  return (
    <View style={[styles.root, bg]} testID={testID}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={inner}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.scroll, inner]}>{children}</View>
      )}
      {footer ? (
        <View
          style={[
            styles.inner,
            // flexGrow 0: on a short page the footer stays its own height at the bottom instead of sharing the free space.
            { flexGrow: 0, maxWidth: t.layout.maxContentWidth, paddingHorizontal: t.layout.screenPaddingX, paddingBottom: insets.bottom + t.space[4], gap: t.space[3] },
          ]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1 },
  inner: { width: '100%', alignSelf: 'center', flexGrow: 1 },
});
