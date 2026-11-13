import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCountdown, isUsable, nextRefreshDelayMs, retryDelayMs, secondsLeft } from '../qrCard.ts';
import { defaultTitle, progressPercent, reportStoragePath, resolveMime, validateUpload } from '../upload.ts';

const NOW = new Date('2026-11-13T10:00:00.000Z');
const qr = { payload: 'AM1.x.y.z', expiresAt: '2026-11-13T10:05:00.000Z', refreshAt: '2026-11-13T10:04:00.000Z' };

test('QR card refreshes before expiry and never shows an expired code', () => {
  assert.equal(nextRefreshDelayMs(qr, NOW), 4 * 60_000);
  assert.equal(nextRefreshDelayMs(qr, new Date('2026-11-13T10:04:30.000Z')), 1_000, 'overdue → refresh now');
  assert.equal(secondsLeft(qr, NOW), 300);
  assert.equal(formatCountdown(42), '0:42');
  assert.equal(formatCountdown(300), '5:00');
  assert.equal(isUsable(qr, NOW), true);
  assert.equal(isUsable(qr, new Date('2026-11-13T10:04:57.000Z')), false);
  assert.equal(isUsable(null, NOW), false);
  assert.deepEqual([0, 1, 2, 5].map(retryDelayMs), [2_000, 4_000, 8_000, 30_000]);
});

test('upload validation', () => {
  const ok = { file: { name: 'cbc.pdf', mimeType: 'application/pdf', sizeBytes: 1000 }, category: 'blood_test' as const, title: 'CBC' };
  assert.deepEqual(validateUpload(ok), []);
  assert.deepEqual(validateUpload({ ...ok, category: null }), ['no_category']);
  assert.deepEqual(validateUpload({ ...ok, file: { name: 'a.exe', mimeType: 'application/x-msdownload', sizeBytes: 5 } }), ['unsupported_type']);
  assert.deepEqual(validateUpload({ ...ok, file: { ...ok.file, sizeBytes: 21 * 1024 * 1024 } }), ['too_large']);
  assert.deepEqual(validateUpload({ ...ok, file: { ...ok.file, sizeBytes: 0 } }), ['empty_file']);
  assert.deepEqual(validateUpload({ ...ok, title: '  ' }), ['no_title']);
});

test('MIME falls back to the extension; storage path is under the patient folder', () => {
  assert.equal(resolveMime({ name: 'IMG_001.JPG', mimeType: null, sizeBytes: 1 }), 'image/jpeg');
  assert.equal(resolveMime({ name: 'scan.heic', mimeType: 'application/octet-stream', sizeBytes: 1 }), 'image/heic');
  assert.equal(reportStoragePath('pat-1', 'application/pdf', 'abc'), 'pat-1/abc.pdf');
  assert.throws(() => reportStoragePath('pat-1', 'text/html'));
  assert.equal(defaultTitle('cbc_report-nov.pdf'), 'cbc report nov');
  assert.deepEqual([progressPercent(50, 200), progressPercent(5, 0), progressPercent(300, 200)], [25, 0, 100]);
});
