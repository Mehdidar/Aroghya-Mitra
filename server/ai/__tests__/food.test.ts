import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseStructured } from '../extractStructured';
import { FoodAnalysis } from '../food/schema';
import { DEFAULT_PORTION_GRAMS, FallbackFoodRecognizer, mapDishDetect, type FoodRecognition, type FoodRecognizer } from '../food/FoodRecognizer';

const image = { bytes: new Uint8Array([0xff, 0xd8]), mimeType: 'image/jpeg' };

describe('FoodAnalysis schema', () => {
  it('parses a thali with string numbers and percent confidence', () => {
    const out = parseStructured(
      JSON.stringify({
        isFood: true,
        items: [
          { name: 'Dal tadka', localName: 'दाल तड़का', isIndianDish: true, portionDescription: '1 katori', estimatedGrams: '150', per100g: { kcal: 120, proteinG: '6', carbsG: 15, fatG: 4 }, confidence: '85%' },
          { name: 'Roti', localName: null, isIndianDish: true, portionDescription: '2 rotis', estimatedGrams: 80, per100g: { kcal: 297, proteinG: 9.8, carbsG: 54, fatG: 3.7 }, confidence: 0.9 },
        ],
      }),
      FoodAnalysis,
    );
    assert.equal(out.items.length, 2);
    assert.equal(out.items[0].estimatedGrams, 150);
    assert.equal(out.items[0].per100g.proteinG, 6);
    assert.equal(out.items[0].confidence, 0.85);
    assert.equal(out.notes, null);
  });

  it('rejects negative macros', () => {
    assert.throws(() =>
      parseStructured(JSON.stringify({ isFood: true, items: [{ name: 'x', isIndianDish: true, estimatedGrams: 100, per100g: { kcal: -1, proteinG: 0, carbsG: 0, fatG: 0 }, confidence: 1 }] }), FoodAnalysis),
    );
  });
});

describe('DishDetect mapping', () => {
  it('maps a recognised dish with USDA nutrition', () => {
    const r = mapDishDetect({
      dish: { name: 'palak_paneer', local_name: 'पालक पनीर', confidence: 0.91, recognized: true },
      diet: { reliable: true },
      nutrition: { provenance: 'estimated', nutrients: { kcal: 150, protein_g: 7, carbs_g: 6, fat_g: 11 } },
    });
    assert.equal(r.reliable, true);
    assert.equal(r.items[0].name, 'Palak Paneer');
    assert.equal(r.items[0].estimatedGrams, DEFAULT_PORTION_GRAMS);
    assert.deepEqual(r.items[0].per100g, { kcal: 150, proteinG: 7, carbsG: 6, fatG: 11 });
  });

  it('is unreliable when the model abstains or has no nutrition', () => {
    assert.equal(mapDishDetect({ dish: { name: null, recognized: false } }).reliable, false);
    assert.equal(mapDishDetect({ dish: { name: 'dosa', recognized: true }, diet: { reliable: true }, nutrition: { provenance: 'none' } }).reliable, false);
  });
});

describe('FallbackFoodRecognizer', () => {
  const fake = (id: string, result: FoodRecognition | Error): FoodRecognizer => ({
    id,
    recognize: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  });
  const llmResult: FoodRecognition = { isFood: true, items: [], notes: null, source: 'vision-llm', reliable: true };

  it('uses the vision LLM when the team model is unreliable or down', async () => {
    const unreliable: FoodRecognition = { isFood: true, items: [], notes: null, source: 'dishdetect', reliable: false };
    assert.equal((await new FallbackFoodRecognizer(fake('d', unreliable), fake('v', llmResult)).recognize(image)).source, 'vision-llm');
    assert.equal((await new FallbackFoodRecognizer(fake('d', new Error('down')), fake('v', llmResult)).recognize(image)).source, 'vision-llm');
  });

  it('keeps a confident team-model result', async () => {
    const good = mapDishDetect({ dish: { name: 'idli', recognized: true, confidence: 0.95 }, diet: { reliable: true }, nutrition: { provenance: 'verified', nutrients: { kcal: 146, protein_g: 4.5, carbs_g: 30, fat_g: 0.4 } } });
    assert.equal((await new FallbackFoodRecognizer(fake('d', good), fake('v', llmResult)).recognize(image)).source, 'dishdetect');
  });
});
