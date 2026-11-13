"""The predictor's output contract. The UI and the API both read these keys,
and a silent rename breaks them without any import error."""

import os

import pytest
from PIL import Image

from core import taxonomy
from core.config import ROOT, VEGAN_THRESHOLD

pytestmark = pytest.mark.slow

SAMPLE = os.path.join(ROOT, 'tests', 'fixtures', 'sample_dish.jpg')


@pytest.fixture(scope='module')
def predictor():
    from core.predictor import DietPredictor
    return DietPredictor()


@pytest.fixture(scope='module')
def result(predictor):
    if not os.path.exists(SAMPLE):
        pytest.skip('sample image not available')
    return predictor.predict(SAMPLE)


def test_top_level_keys(result):
    for key in ('dish', 'diet', 'lookup', 'ingredients', 'animal_byproduct',
                'rationale', 'probabilities', 'crop_method', 'warnings',
                'openset', 'nutrition'):
        assert key in result, f'missing key: {key}'


def test_diet_block(result):
    diet = result['diet']
    # 'meat_free' is a predictor-only tier: a vegan claim withheld.
    assert diet['tier'] in taxonomy.TIERS + ('meat_free',)
    assert 0.0 <= diet['confidence'] <= 1.0
    assert isinstance(diet['reliable'], bool)
    assert diet['label']


def test_dish_block(result):
    dish = result['dish']
    assert isinstance(dish['recognized'], bool)
    assert 0.0 <= dish['confidence'] <= 1.0
    # an unrecognised dish must not leak a name into the public field
    if not dish['recognized']:
        assert dish['name'] is None


def test_confidence_is_composed_not_conditional(result):
    """The vegan/vegetarian tiers must report P(veg) x P(tier | veg), so the
    final confidence can never exceed the stage that gated it."""
    p = result['probabilities']
    if result['diet']['tier'] in ('vegan', 'vegetarian'):
        assert result['diet']['confidence'] <= p['veg'] + 1e-6, \
            'confidence exceeds P(veg) — it is conditional, not composed'


def test_vegan_requires_more_than_argmax(result):
    """'vegan' is the claim that can harm someone, so it must clear the
    threshold rather than merely win."""
    p = result['probabilities']
    if result['diet']['tier'] == 'vegan':
        assert p['vegan_given_veg'] > VEGAN_THRESHOLD


def test_unreliable_when_out_of_distribution(predictor):
    """An out-of-distribution photo must not come back reliable — the binary
    heads do not rescue it (65.9% on German cuisine against 91.7% in domain)."""
    noise = Image.effect_noise((320, 320), 64).convert('RGB')
    r = predictor.predict(noise)
    if r['openset'] and not r['openset']['in_distribution']:
        assert r['diet']['reliable'] is False
        assert r['dish']['name'] is None
        assert r['warnings']


def test_stand_in_models_are_never_reliable(predictor, result):
    """Until the Indian heads are trained, the Saudi checkpoints stand in.
    Their accuracy on Indian food is unmeasured, so nothing they say may be
    marked reliable, and without a dish head 'vegan' may not be claimed."""
    if predictor.baseline_heads:
        assert result['diet']['reliable'] is False
        assert any('Saudi' in w for w in result['warnings'])
    if 'dish' not in predictor.heads:
        assert result['dish']['name'] is None
        assert result['diet']['tier'] != 'vegan'
        assert result['alternatives'] == []


def test_nutrition_provenance_is_explicit(result):
    n = result['nutrition']
    assert n['provenance'] in ('verified', 'estimated', 'none')
    if n['provenance'] != 'none':
        assert n['nutrients'].get('kcal') is not None
        assert n['matched']


def test_cross_check_is_tri_state(result):
    assert result['lookup']['agreement'] in (True, False, None)
