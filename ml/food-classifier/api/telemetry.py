"""
telemetry.py
------------
Two things the service could not do before: say which model answered, and
remember what it said.

Model version
    A short digest over every file that can change an answer -- the probe
    classifiers, the remaining checkpoint, the taxonomy, the nutrition map,
    the open-set index -- plus the decision thresholds. It travels in every
    response, so a complaint about a wrong verdict can be traced to the
    build that produced it instead of to "the model, some time in October".

Prediction log
    One JSON line per prediction. This is the only route by which the
    system can learn what it gets wrong in the field: the 48-photograph
    benchmark cannot distinguish a 93% system from a 98% one, and no
    amount of further modelling fixes that -- only photographs do.

Photographs are NOT stored unless DISHDETECT_LOG_IMAGES=1 is set, because
storing someone's camera roll is a decision for whoever operates the
service to take deliberately, in the open, with a privacy policy behind
it. The log always records a hash of the image, never the image itself,
so duplicates can be spotted without keeping anything identifying.
"""

import os
import json
import time
import hashlib
import threading

from core import config as _cfg
from core.config import ROOT, HEADS, BASELINES, CLIP_PROBE_HEADS

# Every decision constant, discovered rather than listed. The hand-written
# list missed VEGAN_DISH_CONFIDENCE the day it was added -- a threshold that
# changes verdicts shipped under an unchanged version, which is the one
# thing this digest exists to prevent.
THRESHOLD_NAMES = sorted(
    n for n in dir(_cfg)
    if n.isupper() and isinstance(getattr(_cfg, n), (int, float))
    and not isinstance(getattr(_cfg, n), bool)
)

LOG_DIR = os.environ.get('DISHDETECT_LOG_DIR', os.path.join(ROOT, 'results', 'predictions'))
LOG_IMAGES = os.environ.get('DISHDETECT_LOG_IMAGES', '0') == '1'
MAX_LOG_IMAGE_BYTES = int(os.environ.get('DISHDETECT_LOG_IMAGE_CAP', 2 * 1024 ** 3))

_lock = threading.Lock()
_version = {}


def _digest_file(h, path):
    if os.path.exists(path):
        h.update(path.encode())
        with open(path, 'rb') as f:
            for block in iter(lambda: f.read(1 << 20), b''):
                h.update(block)


def model_version():
    """Short digest of everything that can change an answer."""
    if 'id' in _version:
        return _version['id']
    h = hashlib.sha256()
    paths = [spec['checkpoint'] for spec in HEADS.values()]
    # A baseline serves when the Indian head is missing, so it changes answers too.
    paths += [spec['checkpoint'] for spec in BASELINES.values()]
    paths += list(CLIP_PROBE_HEADS.values())
    paths += [os.path.join(ROOT, 'core', 'indian_taxonomy.json'),
              os.path.join(ROOT, 'core', 'nutrition_map.json'),
              os.path.join(ROOT, 'results', 'openset', 'clip_index.npz')]
    for p in sorted(paths):
        _digest_file(h, p)
    # Thresholds change verdicts without changing a single weight.
    h.update(json.dumps({n: getattr(_cfg, n) for n in THRESHOLD_NAMES},
                        sort_keys=True).encode())
    _version['id'] = h.hexdigest()[:12]
    return _version['id']


def _log_path():
    return os.path.join(LOG_DIR, time.strftime('%Y-%m-%d') + '.jsonl')


def _dir_size(path):
    return sum(os.path.getsize(os.path.join(d, f))
               for d, _, fs in os.walk(path) for f in fs)


def record(result, *, raw, request_id, caller, latency_ms, image_size):
    """Append one prediction. Never raises -- telemetry must not break serving."""
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        sha = hashlib.sha256(raw).hexdigest()
        diet, dish = result.get('diet', {}), result.get('dish', {})
        row = {
            'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'request_id': request_id,
            'caller': caller,
            'model_version': result.get('model_version'),
            'image_sha256': sha,
            'image_bytes': len(raw),
            'image_size': list(image_size),
            'dish': dish.get('name'),
            'dish_confidence': dish.get('confidence'),
            'dish_recognized': dish.get('recognized'),
            'tier': diet.get('tier'),
            'diet_confidence': diet.get('confidence'),
            'reliable': diet.get('reliable'),
            'openset_score': (result.get('openset') or {}).get('score'),
            'in_distribution': (result.get('openset') or {}).get('in_distribution'),
            'crop_method': result.get('crop_method'),
            'agreement': (result.get('lookup') or {}).get('agreement'),
            'latency_ms': latency_ms,
        }

        img_dir = os.path.join(LOG_DIR, 'images')
        if LOG_IMAGES:
            # The cap matters: an unbounded image directory fills the disk of
            # a small instance and takes the API down with it.
            if not os.path.isdir(img_dir) or _dir_size(img_dir) < MAX_LOG_IMAGE_BYTES:
                os.makedirs(img_dir, exist_ok=True)
                dest = os.path.join(img_dir, f'{sha}.jpg')
                if not os.path.exists(dest):
                    with open(dest, 'wb') as f:
                        f.write(raw)
                row['image_file'] = os.path.relpath(dest, LOG_DIR)
            else:
                row['image_file'] = None
                row['image_skipped'] = 'cap reached'

        with _lock, open(_log_path(), 'a') as f:
            f.write(json.dumps(row) + '\n')
    except Exception:
        pass
