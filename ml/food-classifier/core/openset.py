"""
openset.py
----------
Open-set detection: is this photo even one of the dishes the model knows?

The dish head has a fixed set of classes and will name one of them for any image it is
given. Its softmax confidence is the only thing standing between a user and
a confident wrong answer about a cheeseburger. That signal is weak, because
a softmax over known classes is not trained to represent "none of these".

This module adds a second, independent signal: cosine similarity in frozen
OpenCLIP space to the nearest training images. A photo of something the
training set has never contained lands far from every stored vector,
whatever the classifier's softmax says.

This is vector retrieval, not RAG — there is no generation step. At ~1,000
vectors the search is one matrix multiply; no vector database is involved
or needed (an index earns its keep somewhere past 100k vectors).

Licensing: open_clip is MIT. The laion2b checkpoint is openly licensed;
pin it and record its terms (see LICENSES.md).
"""

import os
import json

import numpy as np

from .config import ROOT

MODEL_NAME = 'ViT-B-32'
PRETRAINED = 'laion2b_s34b_b79k'
INDEX_PATH = os.path.join(ROOT, 'results', 'openset', 'clip_index.npz')

_clip = {}


def _load_clip():
    if 'model' not in _clip:
        import open_clip
        import torch
        model, _, preprocess = open_clip.create_model_and_transforms(
            MODEL_NAME, pretrained=PRETRAINED)
        device = ('mps' if torch.backends.mps.is_available()
                  else 'cuda' if torch.cuda.is_available() else 'cpu')
        _clip['model'] = model.to(device).eval()
        _clip['preprocess'] = preprocess
        _clip['device'] = device
        _clip['torch'] = torch
    return _clip


def encode(images, batch_size=32):
    """PIL images (or paths) -> L2-normalised float32 array of shape (n, 512)."""
    from PIL import Image
    c = _load_clip()
    torch = c['torch']

    out = []
    for i in range(0, len(images), batch_size):
        chunk = images[i:i + batch_size]
        tensors = []
        for im in chunk:
            if isinstance(im, str):
                im = Image.open(im)
            tensors.append(c['preprocess'](im.convert('RGB')))
        x = torch.stack(tensors).to(c['device'])
        with torch.no_grad():
            f = c['model'].encode_image(x).float()
            f = f / f.norm(dim=-1, keepdim=True)
        out.append(f.cpu().numpy())
    return np.concatenate(out).astype(np.float32) if out else np.zeros((0, 512), np.float32)


class OpenSetDetector:
    """
    Scores a photo by its similarity to the nearest training images.

    score = mean cosine similarity to the k nearest training vectors.
    Higher means "looks like something in the training set". A photo scoring
    below `threshold` is reported as out-of-distribution.

    Mean-of-top-k rather than the single nearest neighbour, because one
    unusually close match is noisier than a small neighbourhood.
    """

    def __init__(self, index_path=INDEX_PATH, k=5, threshold=None):
        if not os.path.exists(index_path):
            raise FileNotFoundError(
                f'{index_path} not found. Build it with '
                f'`python tools/build_openset_index.py`.')
        z = np.load(index_path, allow_pickle=True)
        self.vectors = z['vectors']                      # (n, 512), normalised
        self.labels = list(z['labels'])
        self.k = int(k)
        meta = json.loads(str(z['meta']))
        self.threshold = float(threshold if threshold is not None
                               else meta.get('threshold', 0.70))
        self.meta = meta

    def scores(self, images):
        q = encode(list(images))
        if q.shape[0] == 0:
            return np.zeros(0, np.float32)
        sims = q @ self.vectors.T                        # cosine, both normalised
        k = min(self.k, sims.shape[1])
        topk = np.partition(sims, -k, axis=1)[:, -k:]
        return topk.mean(axis=1)

    def score(self, image):
        return float(self.scores([image])[0])

    def check(self, image):
        return self._verdict(self.score(image))

    def check_vector(self, vec):
        """Same verdict from a CLIP vector that has already been computed.

        The predictor encodes its views once and shares them with the probe
        heads; re-encoding the full frame here would double the CLIP work
        on every photograph for an identical answer.
        """
        v = np.asarray(vec, dtype=np.float32).reshape(1, -1)
        sims = v @ self.vectors.T
        k = min(self.k, sims.shape[1])
        return self._verdict(float(np.partition(sims, -k, axis=1)[:, -k:].mean()))

    def _verdict(self, s):
        return {'score': round(s, 4),
                'threshold': self.threshold,
                'in_distribution': bool(s >= self.threshold)}

    def nearest(self, image, n=5):
        """The n most similar training images — what the verdict is leaning on."""
        q = encode([image])
        sims = (q @ self.vectors.T)[0]
        idx = np.argsort(-sims)[:n]
        return [(self.labels[i], float(sims[i])) for i in idx]
