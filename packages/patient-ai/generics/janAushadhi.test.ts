import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { findGeneric, totalSaving } from './janAushadhi.ts';

describe('Jan Aushadhi generic lookup (demo table)', () => {
  it('matches brand names and salts, by strength', () => {
    assert.equal(findGeneric('Glycomet 500')?.generic, 'Metformin 500 mg');
    assert.equal(findGeneric('metformin', '1000 mg')?.generic, 'Metformin 1000 mg');
    assert.equal(findGeneric('Dolo 650')?.generic, 'Paracetamol 650 mg');
    assert.equal(findGeneric('Labetalol 100 mg')?.generic, 'Labetalol 100 mg');
    assert.equal(findGeneric('Iron + folic acid')?.generic, 'Iron + folic acid');
  });
  it('does not invent a match for an unknown medicine or a wrong strength', () => {
    assert.equal(findGeneric('Xyzabc 10 mg'), null);
    assert.equal(findGeneric('Amlodipine 2.5 mg'), null);
  });
  it('reports the saving per pack and in total', () => {
    const g = findGeneric('Telma 40');
    assert.ok(g && g.savingInr === 70 && g.savingPercent === 82);
    assert.deepEqual(totalSaving([{ name: 'Telma 40' }, { name: 'Unknown' }, { name: 'Dolo 650' }]), { matched: 2, savingInr: 92 });
  });
});
