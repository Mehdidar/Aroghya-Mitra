"""
predict.py
----------
Single-image prediction. Thin wrapper over core.predictor.

The previous version could not run at all: it had no sys.path prologue, read
results/class_mapping.json (which does not exist), loaded
checkpoints/best_food_classifier.pth (which does not exist), and defaulted to
the EfficientNet architecture while every checkpoint is MobileNetV3.

Usage:
    python scripts/predict.py --image photo.jpg
    python scripts/predict.py --image photo.jpg --json
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import json
import argparse

from core.predictor import DietPredictor


def main():
    ap = argparse.ArgumentParser(description='Predict dietary tier for one image')
    ap.add_argument('--image', required=True)
    ap.add_argument('--backend', default=None, help='crop backend: grabcut | sam')
    ap.add_argument('--no-crop', action='store_true')
    ap.add_argument('--json', action='store_true', help='print raw JSON')
    args = ap.parse_args()

    if not os.path.exists(args.image):
        raise SystemExit(f'No such image: {args.image}')

    r = DietPredictor(use_crop=False if args.no_crop else 'ensemble',
                      crop_backend=args.backend).predict(args.image)

    if args.json:
        print(json.dumps(r, indent=2))
        return

    print()
    print(f"  {r['diet']['label']}   ({r['diet']['confidence']*100:.0f}% confidence)")
    print(f"  dish        : {r['dish']['name'] or '(not recognised)'}"
          f"  [{r['dish']['confidence']*100:.0f}%]")
    if r['ingredients']:
        print(f"  ingredients : {r['ingredients']}")
    if r['animal_byproduct']:
        print(f"  animal      : {r['animal_byproduct']}")
    if r['rationale']:
        print(f"  why         : {r['rationale']}")
    print(f"  cross-check : {r['lookup']['agreement']}   reliable: {r['diet']['reliable']}")
    for w in r['warnings']:
        print(f"  ! {w}")
    print()


if __name__ == '__main__':
    main()
