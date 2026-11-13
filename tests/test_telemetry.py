"""The prediction log must never be the reason a request fails, and the
model version must change when -- and only when -- an answer could change."""

import json
import os

import pytest

import pytest


def test_model_version_is_stable_and_short():
    from api.telemetry import model_version
    v = model_version()
    assert v == model_version()
    assert len(v) == 12 and all(c in '0123456789abcdef' for c in v)


@pytest.mark.parametrize('name', ['VEGAN_THRESHOLD', 'VEGAN_DISH_CONFIDENCE',
                                  'OPENSET_THRESHOLD', 'DISH_CONFIDENCE_FLOOR',
                                  'DIET_CONFIDENCE_FLOOR'])
def test_version_tracks_every_threshold(monkeypatch, name):
    """A threshold change rewrites verdicts without touching a weight, so it
    must move the version. VEGAN_DISH_CONFIDENCE was added and missed."""
    import importlib
    import api.telemetry as t
    importlib.reload(t)
    before = t.model_version()
    monkeypatch.setattr(t._cfg, name, getattr(t._cfg, name) + 0.01)
    t._version.clear()
    assert t.model_version() != before, f'{name} does not affect the version'


def test_every_config_threshold_is_covered():
    import api.telemetry as t
    assert 'VEGAN_DISH_CONFIDENCE' in t.THRESHOLD_NAMES


def test_record_writes_one_line(tmp_path, monkeypatch):
    import api.telemetry as t
    monkeypatch.setattr(t, 'LOG_DIR', str(tmp_path))
    monkeypatch.setattr(t, 'LOG_IMAGES', False)
    result = {'diet': {'tier': 'vegan', 'confidence': 0.9, 'reliable': True},
              'dish': {'name': 'hummus', 'confidence': 0.8, 'recognized': True},
              'openset': {'score': 0.77, 'in_distribution': True},
              'lookup': {'agreement': True},
              'crop_method': 'ensemble:grabcut', 'model_version': 'abc123'}
    t.record(result, raw=b'not-an-image', request_id='r1', caller='c1',
             latency_ms=12.3, image_size=(10, 10))

    lines = [json.loads(l) for l in open(t._log_path())]
    assert len(lines) == 1
    row = lines[0]
    assert row['dish'] == 'hummus' and row['tier'] == 'vegan'
    assert row['request_id'] == 'r1' and row['caller'] == 'c1'
    assert 'image_file' not in row, 'image logged while LOG_IMAGES was off'


def test_record_never_raises(tmp_path, monkeypatch):
    """Telemetry sits in the serving path; a broken log must not 500."""
    import api.telemetry as t
    monkeypatch.setattr(t, 'LOG_DIR', '/proc/cannot/write/here')
    t.record({}, raw=b'', request_id='r', caller='c', latency_ms=1.0,
             image_size=(1, 1))


def test_image_written_only_when_enabled(tmp_path, monkeypatch):
    import api.telemetry as t
    monkeypatch.setattr(t, 'LOG_DIR', str(tmp_path))
    monkeypatch.setattr(t, 'LOG_IMAGES', True)
    t.record({'diet': {}, 'dish': {}}, raw=b'bytes', request_id='r',
             caller='c', latency_ms=1.0, image_size=(1, 1))
    assert list((tmp_path / 'images').glob('*.jpg')), 'no image written'
