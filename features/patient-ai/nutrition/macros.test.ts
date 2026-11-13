import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { energySplit, gramsForMultiplier, macrosForPortion, mealTotals, progress, snapMultiplier } from './macros';

const roti = { kcal: 297, proteinG: 9.8, carbsG: 54, fatG: 3.7 };
const dal = { kcal: 120, proteinG: 6, carbsG: 15, fatG: 4 };

describe('macro recalculation', () => {
  it('scales per-100 g values to a portion', () => {
    assert.deepEqual(macrosForPortion(roti, 80), { kcal: 238, proteinG: 7.8, carbsG: 43.2, fatG: 3 });
    assert.deepEqual(macrosForPortion(dal, 0), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it('recalculates when the portion slider moves', () => {
    const base = macrosForPortion(dal, gramsForMultiplier(150, 1));
    const double = macrosForPortion(dal, gramsForMultiplier(150, 2));
    assert.equal(base.kcal, 180);
    assert.equal(double.kcal, 360);
    assert.equal(gramsForMultiplier(150, 0.5), 75);
  });

  it('snaps and clamps the slider', () => {
    assert.equal(snapMultiplier(1.1), 1);
    assert.equal(snapMultiplier(1.13), 1.25);
    assert.equal(snapMultiplier(0), 0.25);
    assert.equal(snapMultiplier(10), 3);
    assert.equal(snapMultiplier(Number.NaN), 1);
  });

  it('totals a meal', () => {
    assert.deepEqual(mealTotals([{ per100g: roti, grams: 80 }, { per100g: dal, grams: 150 }]), { kcal: 418, proteinG: 16.8, carbsG: 65.7, fatG: 9 });
  });

  it('ignores bad numbers instead of producing NaN', () => {
    const out = macrosForPortion({ kcal: Number.NaN, proteinG: -3, carbsG: 10, fatG: Infinity }, 100);
    assert.deepEqual(out, { kcal: 0, proteinG: 0, carbsG: 10, fatG: 0 });
  });

  it('splits energy into percentages that add up to 100', () => {
    const split = energySplit({ kcal: 0, proteinG: 10, carbsG: 10, fatG: 10 });
    assert.equal(split.protein + split.carbs + split.fat, 100);
    // 40 / 40 / 90 kcal → 23.5% / 23.5% / 52.9%, largest remainders round fat then protein up
    assert.deepEqual(split, { protein: 24, carbs: 23, fat: 53 });
    assert.deepEqual(energySplit({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }), { protein: 0, carbs: 0, fat: 0 });
  });

  it('caps ring progress at 1', () => {
    assert.equal(progress(1000, 2000), 0.5);
    assert.equal(progress(3000, 2000), 1);
    assert.equal(progress(10, 0), 0);
  });
});
