"""The probe heads must be served the way they were measured.

A probe is fitted on the MEAN of its views' CLIP features, renormalised.
Averaging per-view probabilities instead is a different estimator; it would
not reproduce the accuracy the head was accepted on, and nothing would fail
loudly if it were done by mistake.
"""

import os

import numpy as np
import pytest

from core.config import CLIP_PROBE_HEADS, HEADS

pytestmark = pytest.mark.slow


@pytest.mark.parametrize('head', sorted(CLIP_PROBE_HEADS))
def test_probe_file_matches_its_head(head):
    path = CLIP_PROBE_HEADS[head]
    if not os.path.exists(path):
        pytest.skip(f'{head} probe not fitted yet')
    import joblib
    blob = joblib.load(path)
    assert blob['head'] == head
    assert blob['views'] == 'ensemble'
    import json
    with open(os.path.join(HEADS[head]['results_dir'], 'class_mapping.json')) as f:
        assert len(blob['classes']) == len(json.load(f))


@pytest.mark.parametrize('head', sorted(CLIP_PROBE_HEADS))
def test_probe_combines_features_not_probabilities(head):
    path = CLIP_PROBE_HEADS[head]
    if not os.path.exists(path):
        pytest.skip(f'{head} probe not fitted yet')
    from core.predictor import _ProbeHead

    probe = _ProbeHead(head, path)
    rng = np.random.default_rng(0)
    feats = rng.normal(size=(2, 512)).astype(np.float32)
    feats /= np.linalg.norm(feats, axis=1, keepdims=True)

    got = probe.probs_over_views([None, None], feats).numpy()

    m = feats.mean(axis=0, keepdims=True)
    m /= np.linalg.norm(m, axis=1, keepdims=True)
    want = probe.clf.predict_proba(m)[0]
    mean_of_probs = probe.clf.predict_proba(feats).mean(axis=0)

    assert np.allclose(got, want, atol=1e-6)
    assert not np.allclose(got, mean_of_probs, atol=1e-6), \
        'feature-mean and probability-mean agreed; the test cannot detect a swap'


def test_probe_head_without_features_is_an_error():
    path = CLIP_PROBE_HEADS['dish']
    if not os.path.exists(path):
        pytest.skip('dish probe not fitted yet')
    from core.predictor import _ProbeHead
    with pytest.raises(ValueError):
        _ProbeHead('dish', path).probs_over_views([None], None)
