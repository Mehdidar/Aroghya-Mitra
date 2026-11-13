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


def curated_table():
    with open(nutrition.CURATED) as f:
        return {k: v for k, v in json.load(f).items() if isinstance(v, dict)}


def test_every_taxonomy_dish_has_curated_nutrition():
    missing = sorted(set(taxonomy.known_dishes()) - set(curated_table()))
    assert not missing, f'dishes with no curated nutrition row: {missing}'


def test_no_stale_entries_in_curated_table():
    extra = sorted(set(curated_table()) - set(taxonomy.known_dishes()))
    assert not extra, f'curated table references unknown dishes: {extra}'


@pytest.mark.parametrize('dish', sorted(taxonomy.known_dishes()))
def test_curated_row_is_plausible(dish):
    """A recipe table can be wrong by a quarter; it must not be wrong by an
    order of magnitude, and its parts must add up."""
    row = curated_table()[dish]
    for k in ('kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugars_g', 'sodium_mg'):
        assert row[k] >= 0, f'{dish}: {k} negative'
    implied = 4 * row['protein_g'] + 4 * row['carbs_g'] + 9 * row['fat_g']
    assert abs(implied - row['kcal']) / row['kcal'] < 0.2, f'{dish}: kcal disagrees with macros'
    assert row['sugars_g'] <= row['carbs_g'] and row['fiber_g'] <= row['carbs_g'], dish
    assert 20 <= row['portion_g'] <= 400 and row['portion'], f'{dish}: portion'
    from core.diet import ALLERGENS
    assert set(row['allergens']) <= set(ALLERGENS), f'{dish}: unknown allergen'
    assert isinstance(row['onion_garlic'], bool), dish


def test_curated_sweets_are_tagged_sweet():
    """The diabetes caution keys off the tag, so a dessert without it is a
    silent miss: anything with 15 g+ sugar per 100 g must carry it."""
    untagged = sorted(d for d, r in curated_table().items()
                      if r['sugars_g'] >= 15 and 'sweet' not in r['tags'])
    assert not untagged, untagged


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
    assert r['source'].startswith('USDA') or r['source'].startswith('Curated')
    if r['provenance'] == 'none':
        assert 'nutrients' not in r, 'no numbers may be shown without provenance'
    else:
        assert r['nutrients'].get('kcal') is not None
        assert r['per'] == '100 g'
        assert r['matched'] and r['note'], 'every figure says where it came from'
        if r['source'].startswith('USDA'):
            assert r['fdc_id']


def test_curated_table_beats_retrieval_but_not_a_verified_map(monkeypatch):
    """Lookup order: hand-checked USDA map, curated table, retrieval."""
    r = nutrition.for_dish('gulab_jamun')
    assert r['source'].startswith('Curated') and r['provenance'] == 'estimated'
    assert r['hand_checked'] is True and r['portion_g'] and r['allergens']
    monkeypatch.setattr(nutrition, '_hand_map', lambda: {
        'gulab_jamun': {'fdc_id': nutrition._foods()[0][0]['fdc_id'],
                        'provenance': 'verified', 'note': 'test'}})
    assert nutrition.for_dish('gulab_jamun')['provenance'] == 'verified'


def test_no_dish_returns_none_not_a_guess():
    assert nutrition.for_dish(None)['provenance'] == 'none'
    assert nutrition.for_dish('')['provenance'] == 'none'
