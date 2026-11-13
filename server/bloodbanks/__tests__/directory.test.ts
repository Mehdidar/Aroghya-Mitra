import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { directoryRows, firstPhone, parseCsv } from '../directory.ts';

// Header as in the National Health Portal blood bank directory CSV; rows are test fixtures, not real banks.
const HEADER = 'Sr No,Blood Bank Name,State,District,City,Address,Pincode,Contact No,Mobile,Helpline,Fax,Email,Website,Nodal Officer,Contact Nodal Officer,Mobile Nodal Officer,Email Nodal Officer,Qualification Nodal Officer,Category,Blood Component Available,Apheresis,Service Time,License #,Date License Obtained,Date of Renewal,Latitude,Longitude';
const row = (o: Record<string, string>) =>
  HEADER.split(',').map((h) => {
    const v = o[h] ?? '';
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
const CSV = [
  HEADER,
  row({ 'Blood Bank Name': 'Test Govt Blood Centre', State: 'Karnataka', District: 'Bangalore Urban', City: 'Bengaluru', Address: 'Test Road, "Block A", Bengaluru', Pincode: '560001', 'Contact No': '080-2222 3333', Category: 'Govt.', 'Service Time': '24X7', 'License #': 'KTK/123', Latitude: '12.97', Longitude: '77.59' }),
  row({ 'Blood Bank Name': 'Test Charitable Trust', State: 'Karnataka', District: 'Bangalore Urban', City: 'Bengaluru', Address: 'Test Lane', Mobile: '9876543210', Category: 'Charitable/Vol', Latitude: '13.0', Longitude: '77.6' }),
  row({ 'Blood Bank Name': 'No Coordinates', State: 'Karnataka', District: 'Bangalore Urban', Address: 'x', Latitude: '', Longitude: '' }),
  row({ 'Blood Bank Name': 'Swapped Coordinates', State: 'Karnataka', District: 'Bangalore Urban', Address: 'x', Latitude: '77.6', Longitude: '12.9' }),
  row({ 'Blood Bank Name': 'Other State', State: 'Kerala', District: 'Ernakulam', Address: 'x', Latitude: '10', Longitude: '76.3' }),
].join('\r\n');

describe('official blood bank directory import', () => {
  it('parses quoted CSV fields with commas and quotes', () => {
    assert.deepEqual(parseCsv('a,"b, ""c""",d\n1,2,3'), [['a', 'b, "c"', 'd'], ['1', '2', '3']]);
  });

  it('keeps valid rows for the chosen state and skips rows with missing or impossible coordinates', () => {
    const r = directoryRows(CSV, { state: 'Karnataka' });
    assert.deepEqual(r.missingColumns, []);
    assert.deepEqual(r.rows.map((x) => x.name), ['Test Govt Blood Centre', 'Test Charitable Trust']);
    assert.deepEqual(r.skipped.sort((a, b) => a.reason.localeCompare(b.reason)), [
      { reason: 'missing or impossible coordinates', count: 2 },
      { reason: 'outside the chosen state/district', count: 1 },
    ]);
    const [gov, trust] = r.rows;
    assert.equal(gov.category, 'government');
    assert.equal(gov.open_24x7, true);
    assert.equal(gov.phone, '+918022223333');
    assert.equal(gov.address, 'Test Road, "Block A", Bengaluru');
    assert.equal(trust.category, 'charitable');
    assert.equal(trust.phone, '+919876543210');
    assert.equal(trust.open_24x7, false);
  });

  it('refuses a file that is not the directory', () => {
    assert.deepEqual(directoryRows('foo,bar\n1,2').missingColumns, ['name', 'address', 'lat', 'lng']);
  });

  it('takes the first real phone number and ignores junk', () => {
    assert.equal(firstPhone('NA', '080-2345 6789 / 080-1111 2222'), '+918023456789');
    assert.equal(firstPhone('', '', '1234'), null);
  });
});
