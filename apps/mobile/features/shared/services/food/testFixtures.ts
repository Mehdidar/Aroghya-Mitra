import type { FoodRecognition } from './types';

// Test fixtures only (approximate per-100 g values for common Bengaluru dishes). Never shown to
// users: when the food scan cannot be reached the app says so instead of showing a sample dish.
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
        per100g: { kcal: 168, proteinG: 3.9, carbsG: 25.6, fatG: 5.6, fiberG: 2, sugarsG: 1, sodiumMg: 330 },
        confidence: 0.86,
        diet: {
          tier: 'vegetarian',
          reliable: true,
          allergens: ['dairy'],
          containsOnionGarlic: true,
          suitable: { vegetarian: true, vegan: false, egg_free: true, dairy_free: false, gluten_free: true, nut_free: true, no_onion_garlic: false },
          cautions: [],
        },
        nutrition: { provenance: 'estimated', source: 'Curated estimate: IFCT 2017 (NIN) ingredient values + standard recipes', note: null },
      },
    ],
    notes: 'Fermented rice-and-urad batter crêpe with a spiced potato filling, usually served with chutney and sambar.',
    source: 'dishdetect',
    reliable: true,
    requestId: null,
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
        per100g: { kcal: 172, proteinG: 9.4, carbsG: 20.8, fatG: 5.9, fiberG: 1, sugarsG: 1.5, sodiumMg: 420 },
        confidence: 0.79,
        diet: {
          tier: 'non_veg',
          reliable: true,
          allergens: ['dairy', 'nuts'],
          containsOnionGarlic: true,
          suitable: { vegetarian: false, vegan: false, egg_free: true, dairy_free: false, gluten_free: true, nut_free: false, no_onion_garlic: false },
          cautions: [
            { code: 'hypertension', level: 'moderate' },
            { code: 'heart', level: 'moderate' },
          ],
        },
        nutrition: { provenance: 'estimated', source: 'Curated estimate: IFCT 2017 (NIN) ingredient values + standard recipes', note: null },
      },
    ],
    notes: 'Layered basmati rice cooked with marinated chicken and spices. Fat depends a lot on how much oil or ghee is used.',
    source: 'dishdetect',
    reliable: true,
    requestId: null,
  },
  {
    isFood: true,
    items: [],
    notes: 'This looks like a curry, but the dish could not be named reliably.',
    source: 'dishdetect',
    reliable: false,
    requestId: null,
  },
];
