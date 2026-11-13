"""
predict_batch.py
----------------
Batch inference over a folder of photos, using the unified predictor.

Replaces scripts/predict_menu.py and scripts/predict_hierarchical.py, both of
which imported ultralytics (AGPL-3.0) and hardcoded their own class maps and
image sizes. This script uses core/config.py for all of that.

Usage:
    .venv/bin/python scripts/predict_batch.py --folder path/to/photos
    .venv/bin/python scripts/predict_batch.py --image one.jpg
    .venv/bin/python scripts/predict_batch.py --folder photos --backend sam
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import csv
import json
import argparse

from core.config import VALID_EXTS
from core.predictor import DietPredictor


def main():
    ap = argparse.ArgumentParser(description='Batch dietary prediction')
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--image', help='single image')
    g.add_argument('--folder', help='folder of images (recursive)')
    ap.add_argument('--backend', default=None, help='crop backend: grabcut | sam')
    ap.add_argument('--no-crop', action='store_true')
    ap.add_argument('--output', default=None, help='write results to this CSV')
    args = ap.parse_args()

    pred = DietPredictor(
        use_crop=False if args.no_crop else 'ensemble',
        crop_backend=args.backend,
    )

    if args.image:
        paths = [args.image]
    else:
        paths = sorted(
            os.path.join(r, f)
            for r, _, fs in os.walk(args.folder) for f in fs
            if os.path.splitext(f)[1].lower() in VALID_EXTS
        )

    if not paths:
        print('No images found.')
        return

    rows = []
    for p in paths:
        try:
            r = pred.predict(p)
        except Exception as e:
            print(f'  SKIP {p}: {e}')
            continue
        dish = r['dish']['name'] or '(unrecognised)'
        flag = '' if r['diet']['reliable'] else '  [needs review]'
        print(f"{r['diet']['tier']:<11} {r['diet']['confidence']*100:5.1f}%  "
              f"{dish:<24} {os.path.basename(p)}{flag}")
        rows.append({
            'path': p,
            'dish': r['dish']['name'] or '',
            'dish_confidence': f"{r['dish']['confidence']:.4f}",
            'tier': r['diet']['tier'],
            'diet_confidence': f"{r['diet']['confidence']:.4f}",
            'reliable': int(r['diet']['reliable']),
            'agreement': '' if r['lookup']['agreement'] is None else int(r['lookup']['agreement']),
            'ingredients': r['ingredients'] or '',
            'animal_byproduct': r['animal_byproduct'] or '',
            'crop_method': r['crop_method'],
        })

    n = len(rows)
    rel = sum(r['reliable'] for r in rows)
    print(f"\n{n} images · {rel} reliable ({rel/max(n,1)*100:.0f}%) · backend={pred.crop_backend}")

    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f'Saved: {args.output}')

    if args.image:
        print()
        print(json.dumps(pred.predict(args.image), indent=2))


if __name__ == '__main__':
    main()
