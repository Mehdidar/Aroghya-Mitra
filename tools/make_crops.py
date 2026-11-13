"""
make_crops.py
-------------
Pre-crop a dataset with the permissive segmentation backend, preserving the
folder structure. Replaces scripts/yolo_crop.py and scripts/yolo_seg_crop.py,
both of which used ultralytics (AGPL-3.0).

Usage:
    python tools/make_crops.py --input datasets/categorized_dataset \
                               --output datasets/grabcut_dataset
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import argparse
from collections import Counter

from PIL import Image
from tqdm import tqdm

from core.config import VALID_EXTS
from core.crop import crop


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--backend', default=None, help='grabcut | sam')
    ap.add_argument('--quality', type=int, default=95)
    args = ap.parse_args()

    files = [os.path.join(r, f)
             for r, _, fs in os.walk(args.input) for f in fs
             if os.path.splitext(f)[1].lower() in VALID_EXTS]
    print(f'{len(files)} images from {args.input}')

    methods, failed = Counter(), 0
    for src in tqdm(files, desc='cropping'):
        rel = os.path.relpath(src, args.input)
        dst = os.path.join(args.output, os.path.splitext(rel)[0] + '.jpg')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        try:
            img, method = crop(src, backend=args.backend)
            img.save(dst, 'JPEG', quality=args.quality)
            methods[method] += 1
        except Exception:
            failed += 1

    print(f'\nwrote {sum(methods.values())} crops to {args.output}  ({failed} failed)')
    for m, c in methods.most_common():
        print(f'  {m:14s} {c:5d}  ({c/max(sum(methods.values()),1)*100:.1f}%)')


if __name__ == '__main__':
    main()
