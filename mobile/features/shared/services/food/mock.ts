import type { FoodRecognition } from './types';

// Demo results (realistic, approximate per-100 g values for common Bengaluru dishes). Shown with a
// visible "Demo result" pill; never presented as a real analysis.
export const MOCK_RESULTS: readonly FoodRecognition[] = [
  {
    isFood: true,
    items: [
      {
        name: 'Masala dosa',
        localName: 'ಮಸಾಲೆ ದೋಸೆ',
        isIndianDish: true,
        portionDescription: '1 dosa with potato filling',
        estimatedGrams: 180,
        per100g: { kcal: 168, proteinG: 3.9, carbsG: 25.6, fatG: 5.6 },
        confidence: 0.86,
      },
    ],
    notes: 'Fermented rice-and-urad batter crêpe with a spiced potato filling, usually served with chutney and sambar.',
    source: 'dishdetect',
    reliable: true,
  },
  {
    isFood: true,
    items: [
      {
        name: 'Chicken biryani',
        localName: 'चिकन बिरयानी',
        isIndianDish: true,
        portionDescription: '1 plate',
        estimatedGrams: 250,
        per100g: { kcal: 172, proteinG: 9.4, carbsG: 20.8, fatG: 5.9 },
        confidence: 0.79,
      },
    ],
    notes: 'Layered basmati rice cooked with marinated chicken and spices. Fat depends a lot on how much oil or ghee is used.',
    source: 'dishdetect',
    reliable: true,
  },
  {
    isFood: true,
    items: [],
    notes: 'This looks like a curry, but the dish could not be named reliably.',
    source: 'dishdetect',
    reliable: false,
  },
];

/** Picks a mock result from the photo URI so the same photo always gives the same demo answer. */
export function mockRecognition(seed: string): FoodRecognition {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return MOCK_RESULTS[h % MOCK_RESULTS.length];
}
