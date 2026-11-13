/** Tiny WAV helpers: Bulbul returns WAV, and the realtime STT socket wants raw PCM. */

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  pcm: Uint8Array;
}

export function parseWav(bytes: Uint8Array): WavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');

  let offset = 12;
  let fmt: Omit<WavInfo, 'pcm'> | null = null;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    let size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        channels: view.getUint16(start + 2, true),
        sampleRate: view.getUint32(start + 4, true),
        bitsPerSample: view.getUint16(start + 14, true),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data chunk before fmt chunk');
      // Streaming encoders sometimes write 0 or 0xFFFFFFFF as the data size.
      if (size === 0 || start + size > bytes.length) size = bytes.length - start;
      return { ...fmt, pcm: bytes.subarray(start, start + size) };
    }
    offset = start + size + (size % 2);
  }
  throw new Error('WAV file has no data chunk');
}

/** 16-bit PCM byte length for a duration, used to cut streaming chunks. */
export function pcm16BytesFor(ms: number, sampleRate: number, channels = 1): number {
  const bytes = Math.round((sampleRate * ms) / 1000) * 2 * channels;
  return bytes;
}
