"""A photograph taken on a phone must give the same answer as the same
photograph upright.

Phones record rotation in the EXIF Orientation tag instead of rotating the
pixels, and PIL does not apply it on open. Every image in this project's
training set and benchmark has the tag stripped, so no accuracy number here
would ever move if this regressed -- but the camera UI is the product's main
entry point, and a mis-oriented photograph once turned a lamb mandi into a
'vegan' verdict.
"""

import os

import pytest
from PIL import Image

from core.config import ROOT

pytestmark = pytest.mark.slow

SAMPLE = os.path.join(ROOT, 'tests', 'fixtures', 'sample_dish.jpg')


@pytest.fixture(scope='module')
def pair(tmp_path_factory):
    """(upright image, the same image as a phone would send it)."""
    if not os.path.exists(SAMPLE):
        pytest.skip('sample image not available')
    upright = Image.open(SAMPLE).convert('RGB')
    exif = upright.getexif()
    exif[274] = 6                                  # rotate 90 CW on display
    path = tmp_path_factory.mktemp('exif') / 'phone.jpg'
    upright.rotate(90, expand=True).save(path, exif=exif.tobytes())
    return upright, Image.open(path)


def test_pil_alone_does_not_apply_the_tag(pair):
    """Guards the assumption the fix rests on."""
    upright, phone = pair
    assert phone.size == (upright.size[1], upright.size[0])


def test_predictor_applies_it(pair):
    from core.predictor import DietPredictor
    upright, phone = pair
    p = DietPredictor(use_crop='ensemble')
    a, b = p.predict(upright), p.predict(phone)
    assert a['diet']['tier'] == b['diet']['tier']
    assert a['dish']['name'] == b['dish']['name']
