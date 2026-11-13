/**
 * Web build of LeafletMap: the same Leaflet page in a sandboxed <iframe srcDoc>, since
 * react-native-webview has no web implementation. Data goes in with postMessage; marker
 * taps come back with postMessage from the iframe.
 */
import { createElement, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';

import { parseMapMessage, useMapPayload, type LeafletMapProps } from './mapBridge';
import { buildLeafletHtml } from './leafletHtml';

export type { LeafletMapProps };

export function LeafletMap({ places, user, selectedId, onSelect, accessibilityLabel, style, testID }: LeafletMapProps) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef(false);
  const html = useMemo(() => buildLeafletHtml(), []);
  const payload = useMapPayload(places, user, selectedId);
  const latest = useRef(payload);
  useEffect(() => {
    latest.current = payload;
  }, [payload]);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const post = (p: typeof payload) => frame.current?.contentWindow?.postMessage({ source: 'am-app', payload: p }, '*');
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data as { source?: string; data?: string } | null;
      if (!d || d.source !== 'am-map' || typeof d.data !== 'string') return;
      const m = parseMapMessage(d.data);
      if (m?.type === 'ready') {
        ready.current = true;
        post(latest.current);
      } else if (m?.type === 'select') onSelectRef.current(m.id);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (ready.current) frame.current?.contentWindow?.postMessage({ source: 'am-app', payload }, '*');
  }, [payload]);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={[{ overflow: 'hidden' }, style]} testID={testID}>
      {createElement('iframe', {
        ref: frame,
        srcDoc: html,
        title: accessibilityLabel,
        'aria-hidden': true,
        tabIndex: -1,
        // No allow-same-origin: the page gets an opaque origin and cannot reach the app.
        sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox',
        referrerPolicy: 'strict-origin-when-cross-origin',
        style: { border: 0, width: '100%', height: '100%', display: 'block' },
      })}
    </View>
  );
}
