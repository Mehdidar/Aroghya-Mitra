/**
 * Street map (Leaflet + OpenStreetMap tiles) in a WebView. The list below the map is the
 * accessible view, so the map itself is hidden from screen readers and the container only
 * announces what it is. Web uses LeafletMap.web.tsx (an iframe), since WebView has no web build.
 */
import { useCallback, useEffect, useMemo, useRef, type ComponentType, type Ref } from 'react';
import { Linking, View } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewNavigation, type WebViewProps } from 'react-native-webview';

import { buildLeafletHtml, setDataScript } from './leafletHtml';
import { parseMapMessage, useMapPayload, type LeafletMapProps } from './mapBridge';

export type { LeafletMapProps };

// The package declares WebView<P = undefined>, which makes its JSX props `never`; give it concrete ones.
type WebViewHandle = { injectJavaScript: (script: string) => void };
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

// A real https base URL so tile requests carry a Referer, as the OSM tile policy asks.
const BASE_URL = 'https://localhost/';

export function LeafletMap({ places, user, selectedId, onSelect, accessibilityLabel, style, testID }: LeafletMapProps) {
  const ref = useRef<WebViewHandle>(null);
  const ready = useRef(false);
  const html = useMemo(() => buildLeafletHtml(), []);
  const payload = useMapPayload(places, user, selectedId);
  const latest = useRef(payload);
  useEffect(() => {
    latest.current = payload;
  }, [payload]);

  useEffect(() => {
    if (ready.current) ref.current?.injectJavaScript(setDataScript(payload));
  }, [payload]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const m = parseMapMessage(e.nativeEvent.data);
      if (!m) return;
      if (m.type === 'ready') {
        ready.current = true;
        ref.current?.injectJavaScript(setDataScript(latest.current));
      } else if (m.type === 'select') onSelect(m.id);
    },
    [onSelect],
  );

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={[{ overflow: 'hidden' }, style]} testID={testID}>
      <View style={{ flex: 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <WebView
          ref={ref}
          source={{ html, baseUrl: BASE_URL }}
          originWhitelist={['https://*', 'about:*']}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled={false}
          setSupportMultipleWindows={false}
          // Links in the page (the OSM attribution) open in the browser, not inside the map.
          onShouldStartLoadWithRequest={(req: WebViewNavigation) => {
            if (req.url === BASE_URL || req.url.startsWith('about:') || req.url.startsWith('data:')) return true;
            void Linking.openURL(req.url).catch(() => undefined);
            return false;
          }}
          style={{ flex: 1, backgroundColor: 'transparent' }}
          testID={testID ? `${testID}-webview` : undefined}
        />
      </View>
    </View>
  );
}
