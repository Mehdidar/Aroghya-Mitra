/**
 * POST /ai/prescription (server/ai/prescription/routes.ts) with the photo.
 * When the server cannot be reached the same demo extraction the server
 * would send is used locally, labelled demo with reason 'unreachable'.
 */
import { Platform } from 'react-native';

import { ApiError, apiFetch } from '@/features/shared/services/api';

import { demoExtraction } from './demoExtraction';
import type { ExtractResponse } from './types';

export type PrescriptionImage = { uri: string; mimeType?: string | null; fileName?: string | null };

export class PrescriptionScanError extends Error {
  constructor(public readonly kind: 'bad_image' | 'too_large' | 'server') {
    super(kind);
    this.name = 'PrescriptionScanError';
  }
}

async function buildForm(image: PrescriptionImage, fetchImpl: typeof fetch): Promise<FormData> {
  const form = new FormData();
  const name = image.fileName || 'prescription.jpg';
  const type = image.mimeType || 'image/jpeg';
  if (Platform.OS === 'web') form.append('file', await (await fetchImpl(image.uri)).blob(), name);
  else form.append('file', { uri: image.uri, name, type } as unknown as Blob);
  return form;
}

export async function extractPrescription(image: PrescriptionImage, opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<ExtractResponse> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  try {
    const body = await buildForm(image, fetchImpl);
    const res = await apiFetch('/ai/prescription', { method: 'POST', body, timeoutMs: opts.timeoutMs ?? 60_000, fetchImpl });
    return (await res.json()) as ExtractResponse;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 400) throw new PrescriptionScanError('bad_image');
      if (e.status === 413) throw new PrescriptionScanError('too_large');
      throw new PrescriptionScanError('server');
    }
    return { prescription: demoExtraction(), demo: true, reason: 'unreachable' };
  }
}
