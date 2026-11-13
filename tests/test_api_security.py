"""Auth and rate limiting are the only thing standing between a public
/predict and an unbounded bill: every call is a CLIP pass plus a head."""

import importlib
import os

import pytest


@pytest.fixture
def sec(monkeypatch):
    def build(**env):
        for k, v in env.items():
            monkeypatch.setenv(k, v) if v is not None else monkeypatch.delenv(k, raising=False)
        import api.security as s
        return importlib.reload(s)
    return build


def test_prod_without_keys_refuses_to_start(sec):
    s = sec(DISHDETECT_ENV='prod', DISHDETECT_API_KEYS='')
    with pytest.raises(RuntimeError, match='DISHDETECT_API_KEYS'):
        s.check_startup()


def test_prod_with_keys_starts(sec):
    s = sec(DISHDETECT_ENV='prod', DISHDETECT_API_KEYS='abc')
    s.check_startup()
    assert s.auth_enabled()


def test_dev_without_keys_is_allowed(sec):
    s = sec(DISHDETECT_ENV='dev', DISHDETECT_API_KEYS='')
    s.check_startup()
    assert not s.auth_enabled()


def test_key_id_does_not_leak_the_key(sec):
    s = sec(DISHDETECT_ENV='dev', DISHDETECT_API_KEYS='')
    secret = 'super-secret-key'
    assert secret not in s.key_id(secret)
    assert s.key_id(secret) == s.key_id(secret)


def test_bucket_allows_burst_then_refuses(sec):
    s = sec(DISHDETECT_ENV='dev', DISHDETECT_API_KEYS='')
    lim = s.RateLimiter(per_min=60, burst=3)
    assert [lim.take('a')[0] for _ in range(3)] == [True, True, True]
    ok, wait = lim.take('a')
    assert not ok and wait > 0


def test_callers_are_limited_separately(sec):
    s = sec(DISHDETECT_ENV='dev', DISHDETECT_API_KEYS='')
    lim = s.RateLimiter(per_min=60, burst=2)
    assert all(lim.take('a')[0] for _ in range(2))
    assert not lim.take('a')[0]
    assert lim.take('b')[0], 'one caller exhausted another caller\'s budget'


def test_bucket_refills_over_time(sec, monkeypatch):
    s = sec(DISHDETECT_ENV='dev', DISHDETECT_API_KEYS='')
    lim = s.RateLimiter(per_min=600, burst=1)
    assert lim.take('a')[0]
    assert not lim.take('a')[0]
    clock = [0.0]
    monkeypatch.setattr(s.time, 'monotonic', lambda: clock[0])
    lim2 = s.RateLimiter(per_min=600, burst=1)
    assert lim2.take('x')[0]
    clock[0] += 1.0
    assert lim2.take('x')[0], 'bucket never refilled'
