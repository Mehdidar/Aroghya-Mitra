"""The taxonomy is the single source of dietary truth — it must join cleanly
to the dish head's classes and to the nutrition map."""

import json
import os

import pytest

from core import taxonomy
from core.config import HEADS


def dish_classes():
    path = os.path.join(HEADS['dish']['results_dir'], 'class_mapping.json')
    if not os.path.exists(path):
        pytest.skip('Indian dish head not trained yet')
    with open(path) as f:
        mapping = json.load(f)
    return [mapping[str(i)] for i in range(len(mapping))]


def test_every_dish_class_has_a_taxonomy_entry():
    missing = [c for c in dish_classes() if c not in taxonomy.load()]
    assert not missing, f'dish classes with no taxonomy entry: {missing}'


def test_every_dish_class_resolves_to_a_tier():
    bad = [c for c in dish_classes() if taxonomy.tier(c) not in taxonomy.TIERS]
    assert not bad, f'dish classes with no dietary tier: {bad}'


def test_unknown_dish_returns_none_rather_than_guessing():
    assert taxonomy.tier('definitely not a real dish') is None
    info = taxonomy.info('definitely not a real dish')
    assert info['known'] is False
    assert info['tier'] is None
    assert info['key_ingredients'] is None


@pytest.mark.parametrize('dish', sorted(taxonomy.load()))
def test_every_entry_is_complete(dish):
    entry = taxonomy.load()[dish]
    assert entry.get('legacy_diet') in ('veg', 'non_veg')
    assert entry.get('new_diet') in ('vegan', 'non_vegan')
    assert entry.get('key_ingredients'), f'{dish}: no ingredients recorded'
    assert entry.get('rationale'), f'{dish}: no rationale recorded'
    # a non-vegan meat-free dish must name what makes it non-vegan
    if entry['legacy_diet'] == 'veg' and entry['new_diet'] == 'non_vegan':
        assert entry.get('animal_byproduct'), \
            f'{dish}: vegetarian but no animal byproduct named'


def test_keys_are_normalised():
    """tools/build_diet_datasets.py matches folders to keys after
    lower-casing and replacing spaces and hyphens with underscores."""
    bad = [d for d in taxonomy.load()
           if d != d.strip().lower().replace(' ', '_').replace('-', '_')]
    assert not bad, f'taxonomy keys not in normalised form: {bad}'


def test_egg_dishes_are_non_veg():
    """Indian convention: egg is non-vegetarian."""
    for dish, entry in taxonomy.load().items():
        if (entry.get('animal_byproduct') or '').lower().startswith('egg'):
            assert taxonomy.tier(dish) == 'non_veg', dish


def test_vegan_dishes_have_no_animal_byproduct():
    for dish, entry in taxonomy.load().items():
        if taxonomy.tier(dish) == 'vegan':
            assert not entry.get('animal_byproduct'), \
                f'{dish}: marked vegan but lists an animal byproduct'
