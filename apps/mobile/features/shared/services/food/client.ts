// Thin app-side client for the food recogniser. EXPO_PUBLIC_AI_URL may point at P2's server
// (server/ai/food) or straight at DishDetect India's FastAPI service, which serves the same
// POST /ai/food (api/food.py) with portion, extra nutrients and dietary restrictions, and a
// POST /feedback that the "wrong dish" button uses. EXPO_PUBLIC_AI_KEY, when set, is sent as
// x-api-key (DishDetect in prod mode requires one).
import { Platform } from 'react-native';

import { FoodRecognitionSchema, type FoodScanResult } from './types';
import { filePart } from '@/features/shared/services/filePart';

export type FoodImageInput = { uri: string; mimeType?: string | null; fileName?: string | null };

export class FoodScanError extends Error {
  constructor(
    public readonly kind: 'bad_image' | 'too_large' | 'rate_limited' | 'server' | 'bad_response' | 'offline' | 'unavailable',
    public readonly status?: number
  ) {
    super(kind);
    this.name = 'FoodScanError';
  }
}

export type FoodClientOptions = {
  baseUrl?: string | null;
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  platform?: string;
};

function resolveBase(baseUrl: string | null | undefined) {
  return (baseUrl === undefined ? process.env.EXPO_PUBLIC_AI_URL : baseUrl)?.trim();
}

function authHeaders(apiKey: string | null | undefined): Record<string, string> {
  const key = (apiKey === undefined ? process.env.EXPO_PUBLIC_AI_KEY : apiKey)?.trim();
  return key ? { 'x-api-key': key } : {};
}

export const FOOD_TIMEOUT_MS = 30_000;

async function buildForm(image: FoodImageInput, platform: string, fetchImpl: typeof fetch): Promise<FormData> {
  const form = new FormData();
  const name = image.fileName || 'meal.jpg';
  const type = image.mimeType || 'image/jpeg';
  if (platform === 'web') {
    const blob = await (await fetchImpl(image.uri)).blob();
    form.append('file', blob, name);
  } else {
    // expo/fetch does not send React Native's { uri, name, type } parts: see filePart.ts.
    form.append('file', await filePart(image.uri, name, type));
  }
  return form;
}

/**
 * Sends a meal photo for recognition. No sample dishes: with no server configured it throws
 * 'unavailable', and when the server cannot be reached (offline, DNS, timeout) it throws
 * 'offline', so the screen says so. HTTP errors are thrown with their own kind.
 */
export async function analyzeFood(image: FoodImageInput, opts: FoodClientOptions = {}): Promise<FoodScanResult> {
  const baseUrl = resolveBase(opts.baseUrl);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const platform = opts.platform ?? Platform.OS;

  if (!baseUrl) throw new FoodScanError('unavailable');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? FOOD_TIMEOUT_MS);
  let res: Response;
  try {
    const body = await buildForm(image, platform, fetchImpl);
    res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/ai/food`, {
      method: 'POST',
      body,
      headers: authHeaders(opts.apiKey),
      signal: controller.signal,
    });
  } catch {
    // Network failure or timeout: the server is unreachable.
    throw new FoodScanError('offline');
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
  return { recognition: parseFoodRecognition(json) };
}

export function parseFoodRecognition(json: unknown) {
  const parsed = FoodRecognitionSchema.safeParse(json);
  if (!parsed.success) throw new FoodScanError('bad_response');
  return parsed.data;
}

export type FoodFeedbackOptions = Pick<FoodClientOptions, 'baseUrl' | 'apiKey' | 'fetchImpl'> & {
  /** The `requestId` of the result being corrected. Without one the server cannot tie the correction to a photo. */
  requestId?: string | null;
};

/**
 * "Wrong dish? Tell us". Posts a correction to DishDetect's POST /feedback, which queues it for
 * human review (it never trains the model directly). Reports whether anything was sent: nothing is
 * sent for a demo result, when no server is configured, or when the result carried no requestId.
 */
export async function sendFoodFeedback(correctDish: string, opts: FoodFeedbackOptions = {}): Promise<{ sent: boolean }> {
  const baseUrl = resolveBase(opts.baseUrl);
  const dish = correctDish.trim();
  if (!baseUrl || !opts.requestId || !dish) return { sent: false };
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(opts.apiKey) },
      body: JSON.stringify({ request_id: opts.requestId, kind: 'wrong_dish', correct_dish: dish }),
    });
    return { sent: res.ok };
  } catch {
    return { sent: false };
  }
}
