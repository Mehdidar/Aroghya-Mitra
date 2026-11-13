import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/features/shared/theme';

import { Text } from './Text';

/**
 * The one shared tab bar: a floating dark pill, full width minus 16 on each side. Every tab is
 * icon + label; the active tab is a white rounded rectangle with its icon and label in the role
 * accent. Use with Tabs from 'expo-router/js-tabs': tabBar={(props) => <TabBar {...props} />}.
 * The row is flexDirection 'row', so it mirrors automatically in RTL.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const t = useTheme();
  const tb = t.sizes.tabBar;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        start: 0,
        end: 0,
        bottom: 0,
        paddingHorizontal: tb.marginX,
        paddingBottom: Math.max(insets.bottom, tb.marginBottom),
      }}>
      <View
        role="tablist"
        style={{
          flexDirection: 'row',
          alignSelf: 'center',
          width: '100%',
          maxWidth: t.layout.maxContentWidth,
          minHeight: tb.height,
          padding: t.space[1] + 2,
          gap: t.space[1],
          borderRadius: tb.radius,
          backgroundColor: t.colors.tabBar,
          boxShadow: t.shadows.floating.boxShadow,
        }}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          if ((options as { href?: unknown }).href === null) return null;
          const focused = index === state.index;
          const color = focused ? t.accent.tabActiveFg : t.colors.tabInactiveFg;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              role="tab"
              aria-selected={focused}
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              testID={options.tabBarButtonTestID ?? `tab-${route.name}`}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              style={{
                flex: 1,
                minWidth: tb.itemMinWidth,
                minHeight: Math.max(t.sizes.touchMin, tb.height - 12),
                borderRadius: tb.activeRadius,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                paddingVertical: t.space[1],
                backgroundColor: focused ? t.colors.tabActiveBg : 'transparent',
              }}>
              {options.tabBarIcon?.({ focused, color, size: tb.icon })}
              <Text variant="tabLabel" color={color} numberOfLines={1} maxFontSizeMultiplier={tb.labelMaxScale}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
