"""Every path the config promises must actually exist."""

import os
import json

import pytest

from core.config import (
    HEADS, BASELINES, head_is_trained, ROOT, TAXONOMY_PATH, DISH_CONFIDENCE_FLOOR,
    DIET_CONFIDENCE_FLOOR, VEGAN_THRESHOLD, OPENSET_THRESHOLD,
)


def _mapping(spec):
    with open(os.path.join(spec['results_dir'], 'class_mapping.json')) as f:
        return json.load(f)


@pytest.mark.parametrize('head', sorted(BASELINES))
def test_baseline_checkpoint_exists(head):
    """The Saudi checkpoints are the warm-start and the stand-in; they ship."""
    spec = BASELINES[head]
    assert os.path.exists(spec['checkpoint']), f'{head}: missing {spec["checkpoint"]}'
    mapping = _mapping(spec)
    assert sorted(int(k) for k in mapping) == list(range(len(mapping)))


def test_baseline_binary_heads_have_the_classes_the_predictor_indexes():
    assert set(_mapping(BASELINES['veg']).values()) == {'veg', 'non_veg'}
    assert set(_mapping(BASELINES['vegan']).values()) == {'vegan', 'vegetarian'}


@pytest.mark.parametrize('head', sorted(HEADS))
def test_trained_head_is_well_formed(head):
    if not head_is_trained(head):
        pytest.skip(f'{head}: Indian head not trained yet')
    mapping = _mapping(HEADS[head])
    # keys must be a contiguous 0..n-1 range, since every lookup indexes by position
    assert sorted(int(k) for k in mapping) == list(range(len(mapping)))
    if head == 'veg':
        assert set(mapping.values()) == {'veg', 'non_veg'}
    if head == 'vegan':
        assert set(mapping.values()) == {'vegan', 'vegetarian'}


def test_taxonomy_file_exists():
    assert os.path.exists(TAXONOMY_PATH)


def test_thresholds_are_sane():
    assert 0 < DISH_CONFIDENCE_FLOOR < 1
    assert 0 < DIET_CONFIDENCE_FLOOR < 1
    assert 0.5 < VEGAN_THRESHOLD < 1, 'a vegan threshold at or below 0.5 is just argmax'
    assert 0 < OPENSET_THRESHOLD < 1


def test_no_absolute_user_paths_in_config():
    with open(os.path.join(ROOT, 'core', 'config.py')) as f:
        src = f.read()
    assert '/Users/' not in src, 'config.py must not hardcode a home directory'
