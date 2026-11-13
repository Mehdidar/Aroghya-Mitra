import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QR_TTL_MAX_SECONDS,
  QR_TTL_MIN_SECONDS,
  clampTtl,
  fromQrPayload,
  signQrToken,
  toQrPayload,
  verifyQrToken,
} from '../token.ts';

const SECRET = 'test-secret-that-is-at-least-32-bytes-long!!';
const NOW = new Date('2026-11-13T10:00:00.000Z');
const at = (sec: number) => new Date(NOW.getTime() + sec * 1000);

const b64url = (s: string) => Buffer.from(s).toString('base64url');

test('round trip: a fresh token verifies and carries only id, scope and timing', async () => {
  const { token, claims } = await signQrToken({ patientId: 'pat-1', secret: SECRET, now: NOW });
  const res = await verifyQrToken(token, { secret: SECRET, now: at(60) });
  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'iss', 'jti', 'scope', 'sub']);
  assert.equal(claims.sub, 'pat-1');
  assert.equal(claims.scope, 'history:read');
  assert.equal(claims.exp - claims.iat, 300);
});

test('ttl is clamped to 5–10 minutes', async () => {
  assert.equal(clampTtl(30), QR_TTL_MIN_SECONDS);
  assert.equal(clampTtl(3600), QR_TTL_MAX_SECONDS);
  assert.equal(clampTtl(420), 420);
  assert.equal(clampTtl(Number.NaN), 300);
  const { claims } = await signQrToken({ patientId: 'p', secret: SECRET, now: NOW, ttlSeconds: 99_999 });
  assert.equal(claims.exp - claims.iat, 600);
});

test('expired token is rejected (after skew)', async () => {
  const { token } = await signQrToken({ patientId: 'p', secret: SECRET, now: NOW });
  assert.equal((await verifyQrToken(token, { secret: SECRET, now: at(300 + 20) })).ok, true); // within 30 s skew
  const res = await verifyQrToken(token, { secret: SECRET, now: at(300 + 31) });
  assert.deepEqual([res.ok, !res.ok && res.reason], [false, 'expired']);
});

test('token from the future is rejected', async () => {
  const { token } = await signQrToken({ patientId: 'p', secret: SECRET, now: at(120) });
  const res = await verifyQrToken(token, { secret: SECRET, now: NOW });
  assert.equal(!res.ok && res.reason, 'not_yet_valid');
});

test('wrong secret is rejected', async () => {
  const { token } = await signQrToken({ patientId: 'p', secret: SECRET, now: NOW });
  const res = await verifyQrToken(token, { secret: 'another-secret-also-32-bytes-long-xxxxx', now: NOW });
  assert.equal(!res.ok && res.reason, 'bad_signature');
});

test('tampered payload (patient id swapped) is rejected', async () => {
  const { token } = await signQrToken({ patientId: 'pat-1', secret: SECRET, now: NOW });
  const [h, p, s] = token.split('.');
  const claims = JSON.parse(Buffer.from(p!, 'base64url').toString());
  claims.sub = 'pat-2';
  const forged = `${h}.${b64url(JSON.stringify(claims))}.${s}`;
  const res = await verifyQrToken(forged, { secret: SECRET, now: NOW });
  assert.equal(!res.ok && res.reason, 'bad_signature');
});

test('alg "none" and other algorithms are rejected', async () => {
  const { token } = await signQrToken({ patientId: 'p', secret: SECRET, now: NOW });
  const [, p] = token.split('.');
  for (const alg of ['none', 'HS512', 'RS256']) {
    const forged = `${b64url(JSON.stringify({ alg, typ: 'JWT' }))}.${p}.${token.split('.')[2]}`;
    const res = await verifyQrToken(forged, { secret: SECRET, now: NOW });
    assert.equal(!res.ok && res.reason, 'bad_header', alg);
  }
  const unsigned = `${b64url(JSON.stringify({ alg: 'none' }))}.${p}.`;
  assert.equal((await verifyQrToken(unsigned, { secret: SECRET, now: NOW })).ok, false);
});

test('malformed input is rejected without throwing', async () => {
  for (const bad of ['', 'abc', 'a.b', 'a.b.c.d', '!!.@@.##', 'x'.repeat(5000)]) {
    const res = await verifyQrToken(bad, { secret: SECRET, now: NOW });
    assert.equal(res.ok, false, bad.slice(0, 20));
  }
});

test('short secrets are refused', async () => {
  await assert.rejects(signQrToken({ patientId: 'p', secret: 'short', now: NOW }), /at least 32 bytes/);
});

test('every token gets a unique jti', async () => {
  const a = await signQrToken({ patientId: 'p', secret: SECRET, now: NOW });
  const b = await signQrToken({ patientId: 'p', secret: SECRET, now: NOW });
  assert.notEqual(a.claims.jti, b.claims.jti);
  assert.notEqual(a.token, b.token);
});

test('QR payload prefix: ours round-trips, foreign QR codes are ignored', async () => {
  const { token } = await signQrToken({ patientId: 'p', secret: SECRET, now: NOW });
  assert.equal(fromQrPayload(toQrPayload(token)), token);
  assert.equal(fromQrPayload(`  ${toQrPayload(token)}\n`), token);
  assert.equal(fromQrPayload('https://example.com'), null);
  assert.equal(fromQrPayload(token), null);
  assert.equal(fromQrPayload('AM1.not-a-jwt'), null);
});

test('payload stays small enough for a fast-scanning QR', async () => {
  const { token } = await signQrToken({ patientId: crypto.randomUUID(), secret: SECRET, now: NOW });
  assert.ok(toQrPayload(token).length < 400, `payload length ${toQrPayload(token).length}`);
});
