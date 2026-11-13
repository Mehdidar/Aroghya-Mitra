"""Nutrition provenance must never be implied — a number is either traced to
a hand-checked USDA entry, labelled an estimate, or absent."""

import json
import os

import pytest

from core import nutrition, taxonomy

VALID = {'verified', 'estimated', 'none'}


def hand_map():
    with open(nutrition.MAP) as f:
        return {k: v for k, v in json.load(f).items() if not k.startswith('_')}


def test_nutrition_data_present():
    assert os.path.exists(nutrition.DATA), 'run tools/build_nutrition_index.py'


@pytest.mark.xfail(reason='core/nutrition_map.json has not been written for '
                          'the Indian taxonomy yet', strict=False)
def test_every_taxonomy_dish_is_mapped():
    missing = sorted(set(taxonomy.known_dishes()) - set(hand_map()))
    assert not missing, f'dishes with no nutrition mapping: {missing}'


def test_no_stale_entries_in_map():
    extra = sorted(set(hand_map()) - set(taxonomy.known_dishes()))
    assert not extra, f'nutrition map references unknown dishes: {extra}'


@pytest.mark.parametrize('dish', sorted(hand_map()))
def test_mapping_is_well_formed(dish):
    entry = hand_map()[dish]
    assert entry.get('provenance') in VALID, f'{dish}: bad provenance'
    assert entry.get('note'), f'{dish}: every mapping must say what it is'
    if entry['provenance'] == 'none':
        assert entry.get('fdc_id') is None
    else:
        assert nutrition._by_id(entry['fdc_id']) is not None, \
            f'{dish}: fdc_id {entry["fdc_id"]} is not in the USDA table'


@pytest.mark.parametrize('dish', sorted(taxonomy.known_dishes()))
def test_lookup_contract(dish):
    r = nutrition.for_dish(dish, taxonomy.info(dish)['key_ingredients'])
    assert r['provenance'] in VALID
    assert r['source'].startswith('USDA')
    if r['provenance'] == 'none':
        assert 'nutrients' not in r, 'no numbers may be shown without provenance'
    else:
        assert r['nutrients'].get('kcal') is not None
        assert r['per'] == '100 g'
        assert r['matched'] and r['fdc_id']


def test_no_dish_returns_none_not_a_guess():
    assert nutrition.for_dish(None)['provenance'] == 'none'
    assert nutrition.for_dish('')['provenance'] == 'none'
