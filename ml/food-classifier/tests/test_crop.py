"""Cropping has to be a pure function of the photograph.

GrabCut builds its colour models with k-means, which draws from OpenCV's
global RNG. Left unseeded, the same photograph came back with a different
box on roughly one call in three -- usually a box a few pixels wide, which
`min_area_frac` then rejected, so the predictor quietly fell back to a
centre crop and returned a different confidence for the same image.
"""

import os

import pytest
from PIL import Image

from core.config import ROOT
from core.crop import crop
from core.crop_backends import find_box

SAMPLE = os.path.join(ROOT, 'tests', 'fixtures', 'sample_dish.jpg')


@pytest.fixture(scope='module')
def photo():
    if not os.path.exists(SAMPLE):
        pytest.skip('sample image not available')
    return Image.open(SAMPLE).convert('RGB')


def test_grabcut_box_is_repeatable(photo):
    boxes = [find_box(photo, 'grabcut') for _ in range(8)]
    assert len(set(boxes)) == 1, f'grabcut returned {len(set(boxes))} different boxes'


def test_crop_method_is_repeatable(photo):
    methods = {crop(photo)[1] for _ in range(8)}
    assert methods == {'grabcut'}, f'crop fell back inconsistently: {methods}'


def test_crop_output_is_repeatable(photo):
    sizes = {crop(photo)[0].size for _ in range(8)}
    assert len(sizes) == 1, f'crop returned {len(sizes)} different sizes'
