/**
 * A local file (photo, voice clip) as a multipart upload part.
 *
 * Since Expo SDK 52 the app's global `fetch` is expo/fetch, which does NOT
 * send React Native's old `{ uri, name, type }` form parts: the field goes
 * out empty and the server sees no file. That broke every upload on phones
 * (voice, prescription and food photos, ASHA clips and photos) while tests
 * and the web build, which take other paths, kept passing.
 *
 * expo/fetch does send any part that has `name`, `type` and `bytes()`, so on
 * a phone we hand it exactly that, reading the bytes with expo-file-system
 * only when the request is sent. The name and type are always ours: the
 * file's own guess for .m4a can be "audio/m4a", which Sarvam rejects.
 * On the web the file is a blob: URL, fetched into a real File.
 */
import { Platform } from 'react-native';

export async function filePart(uri: string, name: string, type: string): Promise<Blob> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    return new File([blob], name, { type });
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File: FsFile } = require('expo-file-system') as typeof import('expo-file-system');
  const file = new FsFile(uri);
  const part = {
    name,
    type,
    get size() {
      return file.size ?? 0;
    },
    bytes: async (): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer()),
  };
  return part as unknown as Blob;
}
