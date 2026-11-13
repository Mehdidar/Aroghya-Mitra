import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { useTheme } from '@/features/shared/theme';

/**
 * QR matrix from `qrcode` (pure JS, no canvas), drawn as SVG squares.
 *
 * Made to be read by another phone's camera from this screen: error
 * correction L (the signed token is ~350 characters, so fewer modules matter
 * more than damage tolerance on a clean screen), every module a whole number
 * of pixels with crisp edges, the standard 4-module white border, and as wide
 * as the screen allows.
 */
export function qrModules(text: string): { size: number; dark: boolean[] } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QRCode = require('qrcode') as { create: (t: string, o: { errorCorrectionLevel: string }) => { modules: { size: number; data: Uint8Array | number[] } } };
  const q = QRCode.create(text, { errorCorrectionLevel: 'L' });
  return { size: q.modules.size, dark: Array.from(q.modules.data, (v) => v === 1) };
}

export function QrCodeView({ value, size, testID }: { value: string; size?: number; testID?: string }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const m = useMemo(() => qrModules(value), [value]);
  const quiet = 4;
  const cells = m.size + quiet * 2;
  // Whole pixels per module (blurred half-pixel modules are what cameras fail on), as big as fits.
  const target = size ?? Math.min(360, width - 48);
  const cell = Math.max(2, Math.floor(target / cells));
  size = cell * cells;
  const rects: { x: number; y: number }[] = [];
  for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.dark[y * m.size + x]) rects.push({ x, y });
  return (
    <View testID={testID} accessible accessibilityLabel="QR code" style={{ width: size, height: size, backgroundColor: '#FFFFFF', borderRadius: t.radii.lg, overflow: 'hidden' }}>
      <Svg width={size} height={size}>
        <Rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
        {rects.map((r) => (
          <Rect key={`${r.x}-${r.y}`} x={(r.x + quiet) * cell} y={(r.y + quiet) * cell} width={cell} height={cell} fill="#000000" />
        ))}
      </Svg>
    </View>
  );
}
