import { patientConfig } from '@/features/shared/services/config';
import type { FoodImageInput } from './client';
import { FoodRecognitionSchema, type FoodRecognition } from './types';

async function imageUriToBase64(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] || dataUrl;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const FOOD_SYSTEM_PROMPT = `You are an expert Indian cuisine nutritionist and food vision AI for Aroghya Mitra.
Analyze the image provided:
1. Determine if it depicts food.
2. If food: Identify the dish (e.g. Masala Dosa, Biryani, Palak Paneer, Roti, Dal Tadka, Idli Sambar, Chole Bhature, etc.).
3. Provide the English name and local Indian script name (Hindi or regional).
4. Estimate a standard single-serving portion weight in grams.
5. Provide accurate nutritional macros per 100 grams (kcal, proteinG, carbsG, fatG).
6. Set confidence score between 0.0 and 1.0.

Respond strictly in JSON format matching this schema:
{
  "isFood": true,
  "items": [
    {
      "name": "Masala Dosa",
      "localName": "मसाला डोसा",
      "isIndianDish": true,
      "portionDescription": "1 crisp crepe with potato filling (~180g)",
      "estimatedGrams": 180,
      "per100g": {
        "kcal": 168,
        "proteinG": 3.9,
        "carbsG": 25.6,
        "fatG": 5.6
      },
      "confidence": 0.95
    }
  ],
  "notes": "Crisp fermented rice-lentil crepe filled with spiced potato curry.",
  "source": "vision-llm",
  "reliable": true
}`;

export async function classifyFoodWithGemini(
  image: FoodImageInput
): Promise<FoodRecognition | null> {
  const apiKey = patientConfig.geminiApiKey;
  if (!apiKey) return null;

  try {
    const base64Data = await imageUriToBase64(image.uri);
    const mimeType = image.mimeType || 'image/jpeg';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: 'Analyze this food photo. Classify the dish, portion size, and nutritional macros.',
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [{ text: FOOD_SYSTEM_PROMPT }],
        },
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
        },
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`Gemini Vision API status ${res.status}`);
      return null;
    }

    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const validated = FoodRecognitionSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }
    console.warn('FoodRecognitionSchema validation warning:', validated.error);
    return null;
  } catch (err) {
    console.warn('Gemini vision food classification error:', err);
    return null;
  }
}

