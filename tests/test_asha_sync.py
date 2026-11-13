"""The ASHA sync backend: upsert by id, last-write-wins on updatedAt, and
return only this ASHA's records that changed since the last sync."""

import pytest

from api import asha


@pytest.fixture
def store(tmp_path):
    return asha._Store(str(tmp_path))


def patient(pid, asha_id='asha-1', updated='2026-11-13T10:00:00.000Z', name='A'):
    return {'id': pid, 'ashaId': asha_id, 'updatedAt': updated, 'name': {'en': name}}


def test_requires_asha_id(store):
    with pytest.raises(ValueError):
        asha.sync({}, store)


def test_push_then_pull_round_trip(store):
    r = asha.sync({'ashaId': 'asha-1', 'patients': [patient('p1')],
                   'visits': [{'id': 'v1', 'patientId': 'p1', 'ashaId': 'asha-1',
                               'updatedAt': '2026-11-13T10:00:00.000Z', 'photos': []}],
                   'alerts': [{'id': 'p1:r1:v1', 'patientId': 'p1', 'ashaId': 'asha-1',
                               'createdAt': '2026-11-13T10:00:00.000Z'}],
                   'referrals': []}, store)
    assert r['accepted'] == {'patients': 1, 'visits': 1, 'alerts': 1, 'referrals': 0}
    assert [p['id'] for p in r['patients']] == ['p1']
    assert [v['id'] for v in r['visits']] == ['v1']
    assert r['serverTime'].endswith('Z')
    # a second device for the same ASHA, never synced, gets everything
    again = asha.sync({'ashaId': 'asha-1'}, store)
    assert [p['id'] for p in again['patients']] == ['p1']
    # nothing changed since serverTime
    later = asha.sync({'ashaId': 'asha-1', 'since': '2999-01-01T00:00:00.000Z'}, store)
    assert later['patients'] == [] and later['visits'] == []


def test_last_write_wins(store):
    asha.sync({'ashaId': 'asha-1', 'patients': [patient('p1', updated='2026-11-13T10:00:00.000Z', name='new')]}, store)
    asha.sync({'ashaId': 'asha-1', 'patients': [patient('p1', updated='2026-11-13T09:00:00.000Z', name='stale')]}, store)
    [p] = asha.sync({'ashaId': 'asha-1'}, store)['patients']
    assert p['name'] == {'en': 'new'}
    asha.sync({'ashaId': 'asha-1', 'patients': [patient('p1', updated='2026-11-13T11:00:00.000Z', name='newer')]}, store)
    [p] = asha.sync({'ashaId': 'asha-1'}, store)['patients']
    assert p['name'] == {'en': 'newer'}


def test_other_ashas_records_are_not_returned(store):
    asha.sync({'ashaId': 'asha-1', 'patients': [patient('p1', asha_id='asha-1')]}, store)
    asha.sync({'ashaId': 'asha-2', 'patients': [patient('p2', asha_id='asha-2')]}, store)
    assert [p['id'] for p in asha.sync({'ashaId': 'asha-1'}, store)['patients']] == ['p1']


def test_records_without_id_are_ignored(store):
    r = asha.sync({'ashaId': 'asha-1', 'patients': [{'ashaId': 'asha-1'}, 'junk']}, store)
    assert r['accepted']['patients'] == 0


def test_unknown_fields_survive_a_round_trip(store):
    asha.sync({'ashaId': 'asha-1', 'patients': [{**patient('p1'), 'futureField': {'x': 1}}]}, store)
    [p] = asha.sync({'ashaId': 'asha-1'}, store)['patients']
    assert p['futureField'] == {'x': 1}


def test_photo_path_is_safe(tmp_path):
    name, path = asha.photo_path('../../etc/passwd.PNG', str(tmp_path))
    assert '/' not in name and name.endswith('.png') and path.startswith(str(tmp_path))
    name2, _ = asha.photo_path('weird name.exe', str(tmp_path))
    assert name2.endswith('.jpg') and name2 != name


def test_http_routes(tmp_path, monkeypatch):
    """The routes over the real app, with the model load stubbed out."""
    from fastapi.testclient import TestClient
    import api.main as main
    monkeypatch.setattr(asha, 'ROOT_DIR', str(tmp_path))
    monkeypatch.setattr(main.asha_sync, 'ROOT_DIR', str(tmp_path))
    c = TestClient(main.app)  # no `with`: lifespan (the model load) is skipped
    r = c.post('/asha/sync', json={'ashaId': 'a', 'patients': [patient('p1', asha_id='a')]})
    assert r.status_code == 200 and r.json()['accepted']['patients'] == 1
    assert c.post('/asha/sync', json={}).status_code == 400
    import io
    from PIL import Image
    buf = io.BytesIO(); Image.new('RGB', (4, 4)).save(buf, 'JPEG')
    r = c.post('/asha/photos', files={'file': ('v.jpg', buf.getvalue(), 'image/jpeg')})
    assert r.status_code == 200 and r.json()['url'].startswith('http://testserver/asha/photos/')
    name = r.json()['url'].rsplit('/', 1)[1]
    assert c.get(f'/asha/photos/{name}').status_code == 200
    assert c.get('/asha/photos/nope.jpg').status_code == 404
    assert c.post('/asha/photos', files={'file': ('v.jpg', b'not an image', 'image/jpeg')}).status_code == 400
