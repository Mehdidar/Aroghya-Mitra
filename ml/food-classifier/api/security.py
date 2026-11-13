"""
security.py
-----------
Who may call /predict, and how often.

API keys
    Read from DISHDETECT_API_KEYS (comma-separated). Compared with
    secrets.compare_digest so a wrong key takes the same time as a right
    one. Responses carry a short key id, never the key.

    DISHDETECT_ENV=prod with no keys set is a startup error rather than an
    open service. A dietary API that anyone can call is not only a cost
    problem: each request is a CLIP pass plus a classifier head, so an
    unauthenticated endpoint is a cheap way to take the instance down.
    Default is 'dev', so local work and run_app.sh are unaffected.

Rate limit
    Token bucket per caller, in process. That is the right shape for the
    single always-on instance this is built for; it does NOT hold across
    replicas, and if this is ever run behind more than one process the
    limit must move to shared storage. Said here because the failure is
    silent -- the limit simply multiplies by the number of workers.
"""

import os
import time
import hashlib
import secrets
import threading

from fastapi import Header, HTTPException, Request

ENV = os.environ.get('DISHDETECT_ENV', 'dev')
RATE_PER_MIN = int(os.environ.get('DISHDETECT_RATE_PER_MIN', '30'))
RATE_BURST = int(os.environ.get('DISHDETECT_RATE_BURST', '10'))


def _keys():
    raw = os.environ.get('DISHDETECT_API_KEYS', '')
    return [k.strip() for k in raw.split(',') if k.strip()]


def check_startup():
    """Fail loudly at boot rather than quietly serving the world."""
    if ENV == 'prod' and not _keys():
        raise RuntimeError(
            'DISHDETECT_ENV=prod but DISHDETECT_API_KEYS is empty. Set at '
            'least one key, or run with DISHDETECT_ENV=dev to serve openly.')


def auth_enabled():
    return bool(_keys())


def key_id(key):
    """A stable, non-reversible label for a key, for logs and responses."""
    return hashlib.sha256(key.encode()).hexdigest()[:8] if key else 'anonymous'


class _Bucket:
    __slots__ = ('tokens', 'last')

    def __init__(self, tokens, now):
        # `now` is passed in rather than sampled here: taking it a second
        # time puts `last` fractionally AFTER the caller's `now`, so the
        # first request of a new caller computed a negative elapsed time,
        # lost a sliver of a token and was refused. Every caller's opening
        # request was being rejected.
        self.tokens, self.last = tokens, now


class RateLimiter:
    def __init__(self, per_min=RATE_PER_MIN, burst=RATE_BURST):
        self.rate = per_min / 60.0
        self.burst = max(1, burst)
        self._buckets, self._lock = {}, threading.Lock()

    def take(self, caller):
        """True if the call is allowed; otherwise False and seconds to wait."""
        now = time.monotonic()
        with self._lock:
            b = self._buckets.get(caller)
            if b is None:
                b = self._buckets[caller] = _Bucket(float(self.burst), now)
            b.tokens = min(self.burst, b.tokens + (now - b.last) * self.rate)
            b.last = now
            if b.tokens >= 1.0:
                b.tokens -= 1.0
                return True, 0.0
            return False, (1.0 - b.tokens) / self.rate


limiter = RateLimiter()


async def caller(request: Request, x_api_key: str = Header(default=None)):
    """FastAPI dependency: authenticate, rate limit, return the caller id."""
    keys = _keys()
    if keys:
        if not x_api_key or not any(secrets.compare_digest(x_api_key, k) for k in keys):
            raise HTTPException(401, 'missing or invalid API key')
        who = key_id(x_api_key)
    else:
        # Open mode: limit per client address so one caller cannot starve
        # the rest, even with no key to attribute the traffic to.
        who = f'ip:{request.client.host}' if request.client else 'ip:unknown'

    ok, wait = limiter.take(who)
    if not ok:
        raise HTTPException(429, 'rate limit exceeded',
                            headers={'Retry-After': str(max(1, int(wait + 0.999)))})
    return who
