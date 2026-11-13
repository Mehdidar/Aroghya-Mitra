"""A correction is data, not training.

The queue exists so that user corrections become labelled restaurant
photographs -- the scarcest thing this project has -- without any of them
reaching the model unverified. A path from /feedback to the weights would
be a path for relabelling a dairy dish as vegan.
"""

import importlib
import json

import pytest


@pytest.fixture
def fb(tmp_path, monkeypatch):
    import api.telemetry as t
    monkeypatch.setattr(t, 'LOG_DIR', str(tmp_path))
    import api.feedback as f
    importlib.reload(f)
    monkeypatch.setattr(f, 'QUEUE', str(tmp_path / 'feedback'))
    return f


def test_submission_starts_pending(fb):
    row = fb.submit(request_id='r1', kind='wrong_dish', correct_dish='palak_paneer')
    assert row['state'] == 'pending'
    assert row['reviewed_by'] is None


def test_request_id_is_required(fb):
    """A correction with no prediction attached cannot be reviewed."""
    with pytest.raises(ValueError):
        fb.submit(request_id=None, kind='wrong_dish', correct_dish='palak_paneer')


def test_tier_is_validated(fb):
    with pytest.raises(ValueError):
        fb.submit(request_id='r1', kind='wrong_diet', correct_tier='delicious')


def test_kind_is_validated(fb):
    with pytest.raises(ValueError):
        fb.submit(request_id='r1', kind='nonsense')


def test_unknown_dish_is_flagged_not_rejected(fb):
    """Naming a dish outside the taxonomy is the signal for what to add
    next, so it must be accepted and marked rather than refused."""
    row = fb.submit(request_id='r1', kind='wrong_dish', correct_dish='kabsa')
    assert row['dish_in_taxonomy'] is False
    row2 = fb.submit(request_id='r2', kind='wrong_dish', correct_dish='palak_paneer')
    assert row2['dish_in_taxonomy'] is True


def test_review_is_append_only_and_last_write_wins(fb):
    row = fb.submit(request_id='r1', kind='wrong_dish', correct_dish='palak_paneer')
    fb.set_state(row['id'], 'accepted', 'reviewer')
    fb.set_state(row['id'], 'rejected', 'reviewer2')
    [folded] = fb.load()
    assert folded['state'] == 'rejected'
    assert folded['reviewed_by'] == 'reviewer2'
    assert len(fb.load('accepted')) == 0


def test_state_must_be_a_review_outcome(fb):
    row = fb.submit(request_id='r1', kind='other')
    with pytest.raises(ValueError):
        fb.set_state(row['id'], 'pending', 'reviewer')


def test_note_is_bounded(fb):
    row = fb.submit(request_id='r1', kind='other', note='x' * 5000)
    assert len(row['note']) <= 500


def test_feedback_module_cannot_touch_the_model():
    """The guard that matters: nothing in the feedback path imports a
    trainer, a checkpoint writer or the predictor."""
    import inspect
    import api.feedback as f
    src = inspect.getsource(f)
    for forbidden in ('torch', 'train', 'predictor', 'joblib', 'fit('):
        assert forbidden not in src, f'feedback module references {forbidden!r}'
