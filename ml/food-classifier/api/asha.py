"""
asha.py
-------
The ASHA app's sync backend: POST /asha/sync and POST /asha/photos.

Contract (mobile/features/asha/services/sync.ts):

    POST /asha/sync      SyncRequest  -> SyncResponse
    POST /asha/photos    multipart "file" -> {"url": ...}

The app keeps its own copy of everything and pushes an outbox; the server
upserts by id with last-write-wins on `updatedAt` and returns, for this
ASHA, everything that changed since `since` (patients, visits, and
referrals whose status a doctor changed on the server side).

Storage is a JSON file per collection under DISHDETECT_LOG_DIR/asha (the
same results/ tree the prediction log uses), written atomically. That is
deliberate: this is the single-clinic / hackathon backend, with no schema
to migrate and nothing to provision. Swap `_Store` for a database when
more than one server needs the data.

Records are stored as the app sent them. The server never edits a record
it did not receive, so a field the app adds later survives a round trip.
"""

import json
import os
import re
import time
import uuid

from .telemetry import LOG_DIR

ROOT_DIR = os.environ.get('ASHA_SYNC_DIR', os.path.join(LOG_DIR, 'asha'))
COLLECTIONS = ('patients', 'visits', 'alerts', 'referrals')

# Which field says who owns a record, per collection.
_OWNER = {'patients': 'ashaId', 'visits': 'ashaId', 'alerts': 'ashaId', 'referrals': 'fromAshaId'}
# Which field is the last-write-wins clock. Alerts have no updatedAt: they
# are deterministic by id, so a resend is the same alert and simply wins.
_CLOCK = {'patients': 'updatedAt', 'visits': 'updatedAt', 'referrals': 'updatedAt', 'alerts': 'createdAt'}

_SAFE_NAME = re.compile(r'[^A-Za-z0-9._-]+')


def now_iso():
    return time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime()) + '.000Z'


def _later(a, b):
    """ISO-8601 timestamps compare lexically when both are present."""
    return (a or '') > (b or '')


class _Store:
    def __init__(self, root=None):
        self.root = root or ROOT_DIR

    def _path(self, name):
        return os.path.join(self.root, f'{name}.json')

    def load(self, name):
        p = self._path(name)
        if not os.path.exists(p):
            return {}
        with open(p) as f:
            return json.load(f)

    def save(self, name, data):
        os.makedirs(self.root, exist_ok=True)
        tmp = self._path(name) + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, self._path(name))

    def upsert(self, name, records, received_at):
        """Last-write-wins on the collection's clock. Returns how many were applied."""
        table = self.load(name)
        clock = _CLOCK[name]
        applied = 0
        for rec in records or []:
            rid = rec.get('id') if isinstance(rec, dict) else None
            if not rid:
                continue
            cur = table.get(rid)
            if cur and _later(cur['record'].get(clock), rec.get(clock)):
                continue
            table[rid] = {'record': rec, 'receivedAt': received_at}
            applied += 1
        if applied:
            self.save(name, table)
        return applied

    def changed_since(self, name, asha_id, since):
        """Records owned by this ASHA that the server received after `since`."""
        owner = _OWNER[name]
        out = []
        for row in self.load(name).values():
            rec = row['record']
            if rec.get(owner) != asha_id:
                continue
            if since and not _later(row['receivedAt'], since):
                continue
            out.append(rec)
        return out


def sync(payload, store=None):
    """SyncRequest -> SyncResponse. Pure apart from the store."""
    store = store or _Store()
    asha_id = (payload or {}).get('ashaId')
    if not asha_id or not isinstance(asha_id, str):
        raise ValueError('ashaId is required')
    since = payload.get('since')
    received_at = now_iso()
    pushed = {c: store.upsert(c, payload.get(c), received_at) for c in COLLECTIONS}
    return {
        'serverTime': received_at,
        'patients': store.changed_since('patients', asha_id, since),
        'visits': store.changed_since('visits', asha_id, since),
        'referrals': store.changed_since('referrals', asha_id, since),
        'accepted': pushed,
    }


def photo_path(filename, root=None):
    """A unique, safe filename for an uploaded visit photo."""
    base = _SAFE_NAME.sub('_', os.path.basename(filename or 'photo.jpg')) or 'photo.jpg'
    ext = os.path.splitext(base)[1].lower() or '.jpg'
    if ext not in ('.jpg', '.jpeg', '.png', '.webp'):
        ext = '.jpg'
    name = f'{uuid.uuid4().hex}{ext}'
    d = os.path.join(root or ROOT_DIR, 'photos')
    os.makedirs(d, exist_ok=True)
    return name, os.path.join(d, name)
