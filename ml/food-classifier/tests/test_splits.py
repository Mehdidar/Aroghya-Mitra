"""Split integrity. A test score is only meaningful if the test images were
never seen, so these guard the thing every reported number rests on."""

import json
import os

import pytest

from core.config import HEADS

SPLITS = ('train_files', 'val_files', 'test_files')


def split_info(head):
    path = os.path.join(HEADS[head]['results_dir'], 'split_info.json')
    if not os.path.exists(path):
        pytest.skip(f'{head}: no split_info.json')
    with open(path) as f:
        return json.load(f)


@pytest.mark.parametrize('head', sorted(HEADS))
def test_splits_are_disjoint(head):
    info = split_info(head)
    sets = {k: set(info.get(k, [])) for k in SPLITS if k in info}
    names = list(sets)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            overlap = sets[a] & sets[b]
            assert not overlap, (
                f'{head}: {len(overlap)} file(s) in both {a} and {b}, '
                f'e.g. {sorted(overlap)[:3]}')


@pytest.mark.parametrize('head', sorted(HEADS))
def test_every_split_file_exists(head):
    info = split_info(head)
    for key in SPLITS:
        missing = [p for p in info.get(key, []) if not os.path.exists(p)]
        assert not missing, (
            f'{head}: {len(missing)} missing file(s) in {key}, '
            f'e.g. {missing[:2]}')


@pytest.mark.parametrize('head', sorted(HEADS))
def test_test_split_is_not_empty(head):
    info = split_info(head)
    assert info.get('test_files'), \
        f'{head}: no held-out test split — reported numbers would be validation only'


@pytest.mark.parametrize('head', sorted(HEADS))
def test_split_proportions_are_roughly_as_declared(head):
    info = split_info(head)
    if 'test_files' not in info:
        pytest.skip('two-way split')
    n = {k: len(info.get(k, [])) for k in SPLITS}
    total = sum(n.values())
    assert total > 0
    train_frac = n['train_files'] / total
    assert 0.6 <= train_frac <= 0.8, \
        f'{head}: train is {train_frac:.0%} of the data, expected ~70%'


@pytest.mark.slow
@pytest.mark.parametrize('head', sorted(HEADS))
def test_no_near_duplicate_leaks_between_train_and_test(head):
    """Perceptual-hash check. Slow — run with `-m slow`."""
    imagehash = pytest.importorskip('imagehash')
    from PIL import Image

    info = split_info(head)
    if 'test_files' not in info:
        pytest.skip('two-way split')

    def hashes(paths):
        out = []
        for p in paths:
            try:
                with Image.open(p) as im:
                    out.append(imagehash.phash(im.convert('RGB')))
            except Exception:
                pass
        return out

    train, test = hashes(info['train_files']), hashes(info['test_files'])
    threshold = info.get('hash_threshold', 5)
    leaks = sum(1 for t in test if any((t - r) <= threshold for r in train))
    assert leaks == 0, \
        f'{head}: {leaks} test image(s) within phash {threshold} of a training image'
