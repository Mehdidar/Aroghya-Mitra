import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { useTheme } from '@/features/shared/theme';

/** QR matrix from `qrcode` (pure JS, no canvas), drawn as SVG squares. */
export function qrModules(text: string): { size: number; dark: boolean[] } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QRCode = require('qrcode') as { create: (t: string, o: { errorCorrectionLevel: string }) => { modules: { size: number; data: Uint8Array | number[] } } };
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return { size: q.modules.size, dark: Array.from(q.modules.data, (v) => v === 1) };
}

export function QrCodeView({ value, size = 240, testID }: { value: string; size?: number; testID?: string }) {
  const t = useTheme();
  const m = useMemo(() => qrModules(value), [value]);
  const quiet = 2;
  const cells = m.size + quiet * 2;
  const cell = size / cells;
  const rects: { x: number; y: number }[] = [];
  for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.dark[y * m.size + x]) rects.push({ x, y });
  return (
    <View testID={testID} accessible accessibilityLabel="QR code" style={{ width: size, height: size, backgroundColor: '#FFFFFF', borderRadius: t.radii.lg, overflow: 'hidden' }}>
      <Svg width={size} height={size}>
        <Rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
        {rects.map((r) => (
          <Rect key={`${r.x}-${r.y}`} x={(r.x + quiet) * cell} y={(r.y + quiet) * cell} width={cell + 0.3} height={cell + 0.3} fill="#111318" />
        ))}
      </Svg>
    </View>
  );
}
