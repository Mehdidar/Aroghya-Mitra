// Thin app-side client for P2's food recogniser. The app never talks to DishDetect or a vision LLM
// directly: P2's server (server/ai/food) does, so API keys stay on the server.
// Request to P2: expose POST {EXPO_PUBLIC_AI_URL}/ai/food (multipart field `file`) returning FoodRecognition.
import { Platform } from 'react-native';

import { mockRecognition } from './mock';
import { FoodRecognitionSchema, type FoodScanResult } from './types';

export type FoodImageInput = { uri: string; mimeType?: string | null; fileName?: string | null };

export class FoodScanError extends Error {
  constructor(
    public readonly kind: 'bad_image' | 'too_large' | 'rate_limited' | 'server' | 'bad_response',
    public readonly status?: number
  ) {
    super(kind);
    this.name = 'FoodScanError';
  }
}

export type FoodClientOptions = {
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  platform?: string;
};

export const FOOD_TIMEOUT_MS = 30_000;

async function buildForm(image: FoodImageInput, platform: string, fetchImpl: typeof fetch): Promise<FormData> {
  const form = new FormData();
  const name = image.fileName || 'meal.jpg';
  const type = image.mimeType || 'image/jpeg';
  if (platform === 'web') {
    const blob = await (await fetchImpl(image.uri)).blob();
    form.append('file', blob, name);
  } else {
    // React Native's FormData takes a { uri, name, type } descriptor for files.
    form.append('file', { uri: image.uri, name, type } as unknown as Blob);
  }
  return form;
}

/**
 * Sends a meal photo for recognition. Falls back to a labelled demo result when no server is
 * configured or it cannot be reached (offline, DNS, timeout). Real HTTP errors are thrown so
 * the screen can show them.
 */
export async function analyzeFood(image: FoodImageInput, opts: FoodClientOptions = {}): Promise<FoodScanResult> {
  const baseUrl = (opts.baseUrl === undefined ? process.env.EXPO_PUBLIC_AI_URL : opts.baseUrl)?.trim();
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const platform = opts.platform ?? Platform.OS;
  if (!baseUrl) return { recognition: mockRecognition(image.uri), demo: true, demoReason: 'unset' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? FOOD_TIMEOUT_MS);
  let res: Response;
  try {
    const body = await buildForm(image, platform, fetchImpl);
    res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/ai/food`, { method: 'POST', body, signal: controller.signal });
  } catch {
    // Network failure or timeout: the server is unreachable, so use the demo result.
    return { recognition: mockRecognition(image.uri), demo: true, demoReason: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const s = res.status;
    throw new FoodScanError(s === 400 || s === 415 ? 'bad_image' : s === 413 ? 'too_large' : s === 429 ? 'rate_limited' : 'server', s);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new FoodScanError('bad_response', res.status);
  }
  return { recognition: parseFoodRecognition(json), demo: false };
}

export function parseFoodRecognition(json: unknown) {
  const parsed = FoodRecognitionSchema.safeParse(json);
  if (!parsed.success) throw new FoodScanError('bad_response');
  return parsed.data;
}

/**
 * "Wrong dish? Tell us". TODO(P2): needs a feedback endpoint on the AI server (DishDetect's own
 * /feedback needs its request_id, which FoodRecognition does not carry yet). Until then this is a no-op
 * that reports whether anything was sent.
 */
export async function sendFoodFeedback(_correctDish: string): Promise<{ sent: boolean }> {
  return { sent: false };
}
