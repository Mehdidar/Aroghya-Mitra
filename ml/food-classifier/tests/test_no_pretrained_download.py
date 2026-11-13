"""Inference must not fetch ImageNet weights.

A checkpoint replaces every weight a moment after the backbone is built, so
downloading pretrained weights first is a network dependency on every cold
start for no benefit. It is also not merely wasteful: in a container the
service user has no writable torch cache, and the download raised
PermissionError on /home/dish before the app had served a single request.
"""

import pytest
import torch.hub

from core.models import FoodClassifier


@pytest.fixture
def no_downloads(monkeypatch):
    def boom(*a, **k):
        raise AssertionError('attempted to download pretrained weights')
    monkeypatch.setattr(torch.hub, 'load_state_dict_from_url', boom)


@pytest.mark.parametrize('arch', ['mobilenet_v3_large', 'efficientnet_b2'])
def test_backbone_builds_without_downloading(no_downloads, arch):
    FoodClassifier(num_classes=2, freeze_backbone=False,
                   architecture=arch, pretrained=False)


def test_predictor_asks_for_no_pretrained_weights():
    """The guard that matters -- _Head is what runs in production."""
    import inspect
    from core import predictor
    src = inspect.getsource(predictor._Head.__init__)
    assert 'pretrained=False' in src, \
        '_Head stopped passing pretrained=False; cold starts will hit the network'
