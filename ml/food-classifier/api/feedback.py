"""
feedback.py
-----------
Corrections from users, and the one rule that governs them.

A correction is DATA, not TRAINING. It is written to a review queue and
changes nothing about the model until a person who knows the cuisine has
confirmed it and it has gone through the ordinary pipeline, which ends in
re-measurement.

Three reasons it works this way, in order of how much they matter:

  Safety.   This system's job is a dietary verdict. If a user's correction
            reached the model directly, anyone could relabel a dairy dish
            as vegan and the app would repeat it to the next person. A
            correction endpoint that writes to the model is an endpoint for
            making the app unsafe.

  Accuracy. People photograph dishes precisely because they do not know
            what they are. A correction is a hypothesis about the dish, not
            a ground truth, and on this domain a confident wrong one is
            common -- kabsa and mandi are near-identical on a plate.

  Drift.    Anything that changes the model without changing a measurement
            makes every number in results/metrics/ quietly stale.

What a correction IS good for: it is a labelled photograph taken in a real
restaurant, which is the scarcest thing this project has. The 48-image
benchmark is the binding limit on everything that can be claimed; users
holding phones are the cheapest route past it.

Queue states:  pending -> accepted | rejected
Only `accepted` rows are eligible for tools/review_feedback.py --promote.
"""

import os
import json
import time
import hashlib
import threading

from core import taxonomy
from .telemetry import LOG_DIR

QUEUE = os.path.join(LOG_DIR, 'feedback')
_lock = threading.Lock()

# What a correction may assert. A free-text dish name is allowed because the
# point is to discover dishes outside the taxonomy -- that is how the
# vocabulary learns what to grow into.
TIERS = {'vegan', 'vegetarian', 'meat_free', 'non_veg'}
KINDS = {'wrong_dish', 'wrong_diet', 'not_food', 'other'}


def _path():
    return os.path.join(QUEUE, time.strftime('%Y-%m') + '.jsonl')


def submit(*, request_id, kind, correct_dish=None, correct_tier=None,
           note=None, caller='anonymous'):
    """Record one correction. Returns the stored row, or raises ValueError."""
    if kind not in KINDS:
        raise ValueError(f'kind must be one of {sorted(KINDS)}')
    if correct_tier is not None and correct_tier not in TIERS:
        raise ValueError(f'correct_tier must be one of {sorted(TIERS)}')
    if not request_id:
        raise ValueError('request_id is required; a correction with no '
                         'prediction attached cannot be reviewed')

    known = correct_dish in taxonomy.known_dishes() if correct_dish else None
    row = {
        'id': hashlib.sha256(
            f'{request_id}{time.time()}'.encode()).hexdigest()[:12],
        'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'request_id': request_id,
        'caller': caller,
        'kind': kind,
        'correct_dish': correct_dish,
        # Recorded so the review tool can surface the interesting case: a
        # correction naming a dish the taxonomy has never heard of is a
        # candidate for extending the vocabulary, not a labelling error.
        'dish_in_taxonomy': known,
        'correct_tier': correct_tier,
        'note': (note or '')[:500],
        'state': 'pending',
        'reviewed_by': None,
        'reviewed_at': None,
    }
    os.makedirs(QUEUE, exist_ok=True)
    with _lock, open(_path(), 'a') as f:
        f.write(json.dumps(row) + '\n')
    return row


def load(state=None):
    """Every correction, newest first, optionally filtered by state."""
    import glob
    rows = []
    for p in sorted(glob.glob(os.path.join(QUEUE, '*.jsonl'))):
        with open(p) as f:
            for line in f:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    # A row is appended again when its state changes; the last write wins.
    latest = {}
    for r in rows:
        latest[r['id']] = r
    out = sorted(latest.values(), key=lambda r: r['ts'], reverse=True)
    return [r for r in out if state is None or r['state'] == state]


def set_state(fid, state, reviewer):
    """Accept or reject a queued correction. Append-only; load() folds it."""
    if state not in ('accepted', 'rejected'):
        raise ValueError('state must be accepted or rejected')
    rows = {r['id']: r for r in load()}
    if fid not in rows:
        raise KeyError(fid)
    row = dict(rows[fid])
    row.update(state=state, reviewed_by=reviewer,
               reviewed_at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
    os.makedirs(QUEUE, exist_ok=True)
    with _lock, open(_path(), 'a') as f:
        f.write(json.dumps(row) + '\n')
    return row
