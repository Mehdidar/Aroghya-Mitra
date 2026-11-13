"""
build_openset_index.py
----------------------
Encodes the dish head's TRAINING split with frozen OpenCLIP and stores the
vectors. Only the training split: the index defines what the model has seen,
so putting val or test images in it would make them look in-distribution for
free.

    python tools/build_openset_index.py
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import json
import time

import numpy as np

from core.config import HEADS, ROOT
from core import openset

OUT = openset.INDEX_PATH


def main():
    spec = HEADS['dish']
    split = json.load(open(os.path.join(spec['results_dir'], 'split_info.json')))
    files = [f for f in split['train_files'] if os.path.exists(f)]
    labels = [os.path.basename(os.path.dirname(f)) for f in files]
    print(f'encoding {len(files)} training images with '
          f'{openset.MODEL_NAME}/{openset.PRETRAINED} ...')

    t0 = time.time()
    vectors = openset.encode(files)
    dt = time.time() - t0
    print(f'  {vectors.shape} in {dt:.1f}s ({len(files)/dt:.1f} img/s)')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    meta = {'model': openset.MODEL_NAME, 'pretrained': openset.PRETRAINED,
            'n': int(vectors.shape[0]), 'dim': int(vectors.shape[1]),
            'source': 'dish head train split', 'threshold': 0.70}
    np.savez_compressed(OUT, vectors=vectors, labels=np.array(labels),
                        meta=json.dumps(meta))
    size = os.path.getsize(OUT) / 1e6
    print(f'saved {OUT}  ({size:.1f} MB, {len(set(labels))} dishes)')


if __name__ == '__main__':
    main()
