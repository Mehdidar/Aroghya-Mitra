/**
 * If the map cannot be drawn (an installed app built before the map's native
 * WebView was added, or any map error), show a small notice in its place
 * instead of breaking the screen: the list of places below keeps working.
 */
import { Component, type ReactNode } from 'react';
import { View } from 'react-native';

import i18n from '@/features/shared/i18n';
import { Icon, Text } from '@/features/shared/ui';

type Props = { children: ReactNode };

export class MapBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[maps] map could not be shown:', error instanceof Error ? error.message : error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View accessibilityRole="text" style={{ flex: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 24, backgroundColor: 'rgba(128,128,128,0.12)' }}>
        <Icon name="map-outline" size={28} />
        <Text align="center" variant="bodySmall">
          {i18n.t('maps:mapUnavailable')}
        </Text>
      </View>
    );
  }
}
