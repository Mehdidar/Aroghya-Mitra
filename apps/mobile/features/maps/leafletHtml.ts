/**
 * The HTML page behind LeafletMap: Leaflet 1.9.4 from unpkg (pinned, with SRI) and
 * OpenStreetMap tiles. The page is static; the app sends data with
 * window.__amSetData({ places, user, selectedId, fitKey }) and the page reports
 * marker taps as { type: 'select', id } through ReactNativeWebView.postMessage
 * (native) or parent.postMessage (web iframe).
 *
 * Place names come from OpenStreetMap, so they are only ever set as text, never as HTML.
 */
import { KIND_COLOURS, USER_DOT_COLOUR, type MapPlace } from './types';

export const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
export const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
export const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
export const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type MapPayload = {
  places: Pick<MapPlace, 'id' | 'name' | 'kind' | 'lat' | 'lng'>[];
  user: { lat: number; lng: number } | null;
  selectedId: string | null;
  /** Changes when the set of points changes; the page refits the view only then, not on a selection change. */
  fitKey: string;
};

/** JavaScript that applies a payload inside the page. Ends with `true` as injectJavaScript expects. */
export function setDataScript(payload: MapPayload): string {
  return `window.__amSetData && window.__amSetData(${JSON.stringify(payload).replace(/</g, '\\u003c')});true;`;
}

export function buildLeafletHtml(): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<base target="_blank">
<link rel="stylesheet" href="${LEAFLET_CSS}" integrity="${LEAFLET_CSS_SRI}" crossorigin="">
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #E8EEF2; }
  .leaflet-control-attribution { font-size: 11px; }
  #msg { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; font: 14px system-ui, sans-serif; color: #444; text-align: center; padding: 16px; }
</style>
</head><body>
<div id="map"></div>
<div id="msg">Map could not load. The list below still works.</div>
<script src="${LEAFLET_JS}" integrity="${LEAFLET_JS_SRI}" crossorigin=""></script>
<script>
(function () {
  var COLOURS = ${JSON.stringify(KIND_COLOURS)};
  var USER = ${JSON.stringify(USER_DOT_COLOUR)};
  function send(msg) {
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent && window.parent !== window) window.parent.postMessage({ source: 'am-map', data: s }, '*');
  }
  if (typeof L === 'undefined') {
    document.getElementById('msg').style.display = 'flex';
    send({ type: 'error' });
    return;
  }
  var map = L.map('map', { zoomControl: true, attributionControl: true }).setView([12.9716, 77.5946], 12);
  map.attributionControl.setPrefix(false);
  L.tileLayer(${JSON.stringify(OSM_TILES)}, {
    maxZoom: 19,
    attribution: ${JSON.stringify(OSM_ATTRIBUTION)},
    referrerPolicy: 'strict-origin-when-cross-origin'
  }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var markers = {};
  var userMarker = null;
  var lastFitKey = null;

  function style(kind, selected) {
    return { radius: selected ? 12 : 8, color: '#FFFFFF', weight: selected ? 3 : 2, fillColor: COLOURS[kind] || '#555', fillOpacity: 0.95 };
  }

  window.__amSetData = function (p) {
    layer.clearLayers();
    markers = {};
    var pts = [];
    (p.places || []).forEach(function (pl) {
      var sel = pl.id === p.selectedId;
      var m = L.circleMarker([pl.lat, pl.lng], style(pl.kind, sel));
      m.bindTooltip(String(pl.name || ''), { direction: 'top', offset: [0, -8] });
      m.on('click', function () { send({ type: 'select', id: pl.id }); });
      m.addTo(layer);
      if (sel) m.bringToFront();
      markers[pl.id] = m;
      pts.push([pl.lat, pl.lng]);
    });
    if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
    if (p.user) {
      userMarker = L.circleMarker([p.user.lat, p.user.lng], { radius: 9, color: '#FFFFFF', weight: 3, fillColor: USER, fillOpacity: 1 }).addTo(map);
      pts.push([p.user.lat, p.user.lng]);
    }
    var fit = p.fitKey !== lastFitKey;
    lastFitKey = p.fitKey;
    if (fit && pts.length) {
      if (pts.length === 1) map.setView(pts[0], 15);
      else map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 16 });
    } else if (p.selectedId && markers[p.selectedId]) {
      markers[p.selectedId].openTooltip();
      map.panTo(markers[p.selectedId].getLatLng());
    }
  };
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (d && d.source === 'am-app' && d.payload) window.__amSetData(d.payload);
  });
  send({ type: 'ready' });
})();
</script>
</body></html>`;
}
