"""The vegan claim is the one that can harm someone, so it carries extra
conditions that nothing else does.

"Vegan" asserts the absence of dairy, egg and ghee. A photograph does not
show any of those -- only the dish identity carries them, through the
taxonomy. So the claim requires a confidently recognised dish whose
taxonomy entry says vegan. Without that, the honest answer is 'meat_free':
no meat visible, dairy unconfirmed.

Measured in the Saudi project before this rule existed: 24 of 60
photographs of cheese pies came back "vegan", four of them marked reliable.
The Indian equivalent to collect under datasets/hard_negatives/dairy/ is
photographs of dairy dishes OUTSIDE the taxonomy that look plant-based:
ghee-roast dosa, butter roti, curd rice, malai-topped vegetables.
"""

import pytest

from core.config import VEGAN_DISH_CONFIDENCE, VEGAN_THRESHOLD
from core.predictor import DietPredictor

TIERS = {'vegan', 'vegetarian', 'meat_free', 'non_veg'}


def test_floors_are_ordered():
    """The vegan claim must be at least as strict as naming the dish."""
    from core.config import DISH_CONFIDENCE_FLOOR
    assert VEGAN_DISH_CONFIDENCE >= DISH_CONFIDENCE_FLOOR
    assert 0.0 < VEGAN_THRESHOLD < 1.0


def test_every_tier_has_a_label_and_a_rationale():
    for tier in TIERS:
        assert DietPredictor._label(tier)
        assert DietPredictor._fallback_rationale(tier)


def test_ui_can_render_every_tier_the_predictor_emits():
    """A tier the UI has no style for crashes the result screen."""
    import ast
    src = ast.parse(open('app/camera_ui.py').read())
    styles = next(n for n in ast.walk(src)
                  if isinstance(n, ast.Assign)
                  and getattr(n.targets[0], 'id', None) == 'TIER_STYLE')
    assert TIERS <= {k.value for k in styles.value.keys}


@pytest.mark.slow
class TestAgainstRealPhotographs:
    @pytest.fixture(scope='class')
    def predictor(self):
        return DietPredictor(use_crop='ensemble')

    def test_hidden_dairy_is_never_called_vegan(self, predictor):
        """The regression this rule exists for."""
        import glob
        files = [f for f in sorted(glob.glob('datasets/hard_negatives/dairy/*'))
                 if f.lower().endswith(('.jpg', '.jpeg', '.png'))][:20]
        if not files:
            pytest.skip('hard-negative photographs not available')
        called_vegan = [f for f in files if predictor.predict(f)['diet']['tier'] == 'vegan']
        assert not called_vegan, f'{len(called_vegan)} dairy dishes called vegan'

    def test_vegan_verdicts_carry_a_confident_recognised_dish(self, predictor):
        import glob
        files = [f for f in sorted(glob.glob(
            'datasets/benchmark/*/*.jpg'))][:24]
        if not files:
            pytest.skip('benchmark photographs not available')
        for f in files:
            r = predictor.predict(f)
            if r['diet']['tier'] == 'vegan':
                assert r['dish']['recognized'], f'vegan without a dish: {f}'
                assert r['dish']['confidence'] >= VEGAN_DISH_CONFIDENCE
                assert r['lookup']['tier'] == 'vegan', \
                    f'vegan verdict the taxonomy does not confirm: {f}'
