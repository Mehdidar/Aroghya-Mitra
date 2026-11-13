"""Dietary restrictions are derived, never guessed: an unknown dish says
nothing, a known dish says only what the taxonomy and the curated table
support, and the cautions are judged on the nutrients the user is shown."""

import pytest

from core import diet, nutrition, taxonomy


def test_unknown_dish_is_silent():
    r = diet.restrictions(None)
    assert r['tier'] is None and r['allergens'] == [] and r['cautions'] == []
    assert all(v is None for v in r['suitable'].values())
    assert r['basis'] == 'dish not identified'
    assert diet.restrictions('not_a_dish')['tier'] is None


def test_sweet_dairy_dish():
    r = diet.restrictions('gulab_jamun')
    assert r['tier'] == 'vegetarian'
    assert 'dairy' in r['allergens'] and 'gluten' in r['allergens']
    assert r['suitable'] == {'vegetarian': True, 'vegan': False, 'egg_free': True,
                             'dairy_free': False, 'gluten_free': False,
                             'nut_free': True, 'no_onion_garlic': True}
    codes = {c['code']: c['level'] for c in r['cautions']}
    assert codes['diabetes'] == 'high'
    assert 'hypertension' not in codes


def test_salty_fried_non_veg_dish():
    r = diet.restrictions('chilli_chicken')
    assert r['tier'] == 'non_veg' and r['suitable']['vegetarian'] is False
    assert {'soy', 'gluten', 'egg'} <= set(r['allergens'])
    codes = {c['code']: c['level'] for c in r['cautions']}
    assert codes['hypertension'] == 'high'
    assert codes['heart'] in ('moderate', 'high')
    assert 'diabetes' not in codes


def test_vegan_steamed_dish_has_no_cautions():
    r = diet.restrictions('idli')
    assert r['tier'] == 'vegan' and r['suitable']['vegan'] is True
    assert r['allergens'] == [] and r['cautions'] == []
    assert r['suitable']['no_onion_garlic'] is True


def test_onion_garlic_flag():
    assert diet.restrictions('chicken_curry')['suitable']['no_onion_garlic'] is False
    assert diet.restrictions('chapati')['suitable']['no_onion_garlic'] is True


def test_cautions_use_the_nutrients_passed_in():
    """The caution must be judged on the same numbers shown to the user."""
    shown = nutrition.for_dish('idli')
    shown = {**shown, 'nutrients': {**shown['nutrients'], 'sodium_mg': 900}}
    codes = {c['code'] for c in diet.restrictions('idli', shown)['cautions']}
    assert 'hypertension' in codes


@pytest.mark.parametrize('dish', sorted(taxonomy.known_dishes()))
def test_every_dish_is_consistent_with_its_tier(dish):
    r = diet.restrictions(dish)
    assert r['tier'] == taxonomy.tier(dish)
    assert r['basis'] == 'taxonomy + curated nutrition table'
    if r['tier'] == 'vegan':
        assert 'dairy' not in r['allergens'] and 'egg' not in r['allergens'], dish
    if r['tier'] == 'non_veg':
        assert r['suitable']['vegetarian'] is False
    for c in r['cautions']:
        assert c['code'] in diet.CAUTIONS and c['level'] in ('high', 'moderate') and c['reason']


def test_every_non_veg_dish_names_its_animal_source():
    for dish in taxonomy.known_dishes():
        if taxonomy.tier(dish) == 'non_veg':
            r = diet.restrictions(dish)
            assert r['animal_byproduct'] or ({'fish', 'shellfish', 'egg'} & set(r['allergens'])) \
                or 'red_meat' in nutrition.curated(dish)['tags'] or 'chicken' in dish, dish
