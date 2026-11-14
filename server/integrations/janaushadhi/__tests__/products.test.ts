import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseMrp, productRows, strengthOf } from '../products.ts';

// Column headers as used in PMBJP Product & MRP lists; the rows are test fixtures, not official prices.
const CSV = [
  'Pradhan Mantri Bhartiya Janaushadhi Pariyojana - Product List,,,,',
  'Drug Code,Generic Name,Unit Size,MRP,Group Name',
  '1,Test Tablet A 500 mg,10\'s,"₹ 6.50",Test Group',
  '2,"Test Syrup B 125mg/5ml, flavoured",60 ml,12/-,Test Group',
  '3,Test Capsule C 20 mcg,10\'s,"Rs. 1,250.00",',
  '4,,10\'s,5,Test Group',
  '5,Test Tablet D,10\'s,NA,Test Group',
  '1,Test Tablet A 500 mg duplicate code,10\'s,7,Test Group',
].join('\r\n');

describe('Jan Aushadhi product list import', () => {
  it('finds the header below a title line and parses rows', () => {
    const r = productRows(CSV);
    assert.deepEqual(r.missingColumns, []);
    assert.deepEqual(r.products.map((p) => [p.drugCode, p.mrpInr, p.strength]), [
      ['1', 6.5, '500 mg'],
      ['2', 12, '125 mg'],
      ['3', 1250, '20 mcg'],
    ]);
    assert.equal(r.products[1].name, 'Test Syrup B 125mg/5ml, flavoured');
    assert.equal(r.products[2].group, null);
    assert.deepEqual(r.skipped.sort((a, b) => a.reason.localeCompare(b.reason)), [
      { reason: 'duplicate', count: 1 },
      { reason: 'no product name', count: 1 },
      { reason: 'no usable MRP', count: 1 },
    ]);
  });

  it('accepts the older "Name of the Product" header and reports missing columns', () => {
    assert.equal(productRows('Drug Code,Name of the Product,Unit Size,MRP\n9,Test X 5 mg,10\'s,3').products[0].name, 'Test X 5 mg');
    assert.deepEqual(productRows('Code,Name,Pack\n1,a,b').missingColumns, ['mrp']);
  });

  it('parses MRP and strength formats', () => {
    assert.equal(parseMrp('₹ 12.50'), 12.5);
    assert.equal(parseMrp('0'), null);
    assert.equal(parseMrp('—'), null);
    assert.equal(strengthOf('Levothyroxine 50µg'), '50 mcg');
    assert.equal(strengthOf('Plain bandage'), null);
  });
});
