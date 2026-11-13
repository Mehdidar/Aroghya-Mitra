"""
benchmark_predictor.py
----------------------
End-to-end benchmark of core.predictor.DietPredictor on the real-world
restaurant photo set.

Reports, in addition to plain accuracy:
  * dish-level accuracy (the 25-way head)
  * 3-tier dietary accuracy (the product's actual output)
  * whether the taxonomy-vs-classifier agreement flag is a useful error
    detector, i.e. does disagreement actually predict a wrong answer

Usage:
    .venv/bin/python tools/benchmark_predictor.py
    .venv/bin/python tools/benchmark_predictor.py --no-crop
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import csv
import json
import argparse
from collections import defaultdict

from core.config import VALID_EXTS, ROOT
from core.predictor import DietPredictor

# A held-out set of real photographs, one folder per dish, each folder named
# exactly as the dish is keyed in core/indian_taxonomy.json:
#
#     datasets/benchmark/palak_paneer/*.jpg
#
# These must be photographs the models never trained on -- ideally taken in
# restaurants, not scraped from the same source as the training set.
RESTAURANT_DIR = os.path.join(ROOT, 'datasets', 'benchmark')


def _ground_truth():
    """folder name -> (true 3-tier diet, true dish class), from the taxonomy."""
    from core import taxonomy
    if not os.path.isdir(RESTAURANT_DIR):
        raise SystemExit(f'{RESTAURANT_DIR} not found -- see the comment at the '
                         f'top of tools/benchmark_predictor.py')
    out, unknown = {}, []
    for d in sorted(os.listdir(RESTAURANT_DIR)):
        if not os.path.isdir(os.path.join(RESTAURANT_DIR, d)):
            continue
        t = taxonomy.tier(d)
        if t is None:
            unknown.append(d)
        else:
            out[d] = (t, d)
    if unknown:
        print(f'!! benchmark folders with no taxonomy entry (SKIPPED): {unknown}')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-crop', action='store_true', help='classify the full frame only, no cropping')
    ap.add_argument('--ensemble', action='store_true', help='average cropped + full-frame views')
    ap.add_argument('--backend', default=None, help='crop backend: grabcut | sam')
    ap.add_argument('--out', default=os.path.join(ROOT, 'results', 'tables'))
    args = ap.parse_args()
    GROUND_TRUTH = _ground_truth()

    mode = 'ensemble' if args.ensemble else (not args.no_crop)
    pred = DietPredictor(use_crop=mode, crop_backend=args.backend)
    os.makedirs(args.out, exist_ok=True)

    rows = []
    per_dish = defaultdict(lambda: {'n': 0, 'diet_ok': 0, 'dish_ok': 0})
    missing = []

    for folder, (true_tier, true_dish) in GROUND_TRUTH.items():
        d = os.path.join(RESTAURANT_DIR, folder)
        if not os.path.isdir(d):
            missing.append(folder)
            continue
        for root, _, files in os.walk(d):
            for fn in sorted(files):
                if os.path.splitext(fn)[1].lower() not in VALID_EXTS:
                    continue
                path = os.path.join(root, fn)
                r = pred.predict(path)

                diet_ok = r['diet']['tier'] == true_tier
                dish_ok = (true_dish is not None
                           and r['dish']['raw_prediction'] == true_dish)

                per_dish[folder]['n'] += 1
                per_dish[folder]['diet_ok'] += diet_ok
                per_dish[folder]['dish_ok'] += dish_ok

                # Three outcomes, not two. 'meat_free' is the predictor
                # declining to claim "vegan" for a dish it could not identify
                # confidently -- an abstention, not a wrong answer. Scoring it
                # as an error makes a safety feature look like a regression;
                # scoring it as correct hides the coverage it costs. It is
                # counted separately.
                abstained = r['diet']['tier'] == 'meat_free' and true_tier != 'non_veg'
                # The only outcome that can harm someone: a dish containing
                # meat or dairy reported as free of it.
                dangerous = ((true_tier == 'non_veg'
                              and r['diet']['tier'] in ('veg', 'vegan', 'vegetarian', 'meat_free'))
                             or (true_tier == 'vegetarian' and r['diet']['tier'] == 'vegan'))

                rows.append({
                    'folder': folder, 'file': fn,
                    'true_tier': true_tier, 'pred_tier': r['diet']['tier'],
                    'diet_correct': int(diet_ok),
                    'abstained': int(abstained),
                    'dangerous': int(dangerous),
                    'diet_conf': f"{r['diet']['confidence']:.4f}",
                    'reliable': int(r['diet']['reliable']),
                    'true_dish': true_dish or '',
                    'pred_dish': r['dish']['raw_prediction'],
                    'dish_correct': int(dish_ok),
                    'dish_conf': f"{r['dish']['confidence']:.4f}",
                    'dish_recognized': int(r['dish']['recognized']),
                    'lookup_tier': r['lookup']['tier'] or '',
                    'agreement': '' if r['lookup']['agreement'] is None else int(r['lookup']['agreement']),
                    'crop_method': r['crop_method'],
                })

    if missing:
        print(f'!! MISSING dish folders (excluded from denominator): {missing}')

    n = len(rows)
    diet_ok = sum(r['diet_correct'] for r in rows)
    n_abstained = sum(r['abstained'] for r in rows)
    n_dangerous = sum(r['dangerous'] for r in rows)
    decided = [r for r in rows if not r['abstained']]
    # dish accuracy only over folders where a true dish class exists
    dish_rows = [r for r in rows if r['true_dish']]
    dish_ok = sum(r['dish_correct'] for r in dish_rows)

    print('\n' + '=' * 68)
    print(f"UNIFIED PREDICTOR BENCHMARK  (mode={mode}, backend={pred.crop_backend})")
    print('=' * 68)
    print(f'Images:                    {n}')
    print(f'3-tier dietary accuracy:   {diet_ok}/{n} = {diet_ok/max(n,1)*100:.2f}%')
    print(f'Dish-level accuracy:       {dish_ok}/{len(dish_rows)} = '
          f'{dish_ok/max(len(dish_rows),1)*100:.2f}%  ({n-len(dish_rows)} imgs have no dish class)')

    # --- is the agreement flag a useful error detector? ---
    print('\n' + '-' * 68)
    print('AGREEMENT FLAG AS AN ERROR DETECTOR')
    print('-' * 68)
    agree   = [r for r in rows if r['agreement'] == 1]
    disagree= [r for r in rows if r['agreement'] == 0]
    noflag  = [r for r in rows if r['agreement'] == '']
    for name, grp in (('agree', agree), ('disagree', disagree), ('no dish match', noflag)):
        if grp:
            ok = sum(r['diet_correct'] for r in grp)
            print(f'  {name:14s} n={len(grp):3d}  diet accuracy {ok}/{len(grp)} = {ok/len(grp)*100:6.2f}%')

    rel = [r for r in rows if r['reliable'] == 1]
    unrel = [r for r in rows if r['reliable'] == 0]
    print('\n' + '-' * 68)
    print('ABSTENTION (reliable flag = conf above floor AND no disagreement)')
    print('-' * 68)
    for name, grp in (('reliable', rel), ('flagged', unrel)):
        if grp:
            ok = sum(r['diet_correct'] for r in grp)
            print(f'  {name:14s} n={len(grp):3d}  diet accuracy {ok}/{len(grp)} = {ok/len(grp)*100:6.2f}%')
    if rel:
        print(f'  -> answering only the {len(rel)}/{n} reliable images gives '
              f'{sum(r["diet_correct"] for r in rel)/len(rel)*100:.2f}% at '
              f'{len(rel)/n*100:.0f}% coverage')

    print('\n' + '-' * 68)
    print(f"{'Dish folder':<20} {'true tier':<12} {'diet':<9} {'dish':<9}")
    print('-' * 68)
    for folder, s in per_dish.items():
        has_dish = GROUND_TRUTH[folder][1] is not None
        dish_cell = f"{s['dish_ok']}/{s['n']}" if has_dish else 'n/a'
        print(f"{folder:<20} {GROUND_TRUTH[folder][0]:<12} "
              f"{s['diet_ok']}/{s['n']:<7} {dish_cell:<9}")

    crops = defaultdict(int)
    for r in rows:
        crops[r['crop_method']] += 1
    print('\ncrop methods: ' + '  '.join(f'{k}={v}' for k, v in crops.items()))

    suffix = ('_ensemble' if args.ensemble else ('_nocrop' if args.no_crop else '')) + (f'_{args.backend}' if args.backend else '')
    csv_path = os.path.join(args.out, f'restaurant_benchmark{suffix}.csv')
    with open(csv_path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    summary = {
        'crop': not args.no_crop,
        'n_images': n,
        'diet_accuracy': diet_ok / max(n, 1),
        'n_abstained': n_abstained,
        'diet_acc_when_decided': (sum(r['diet_correct'] for r in decided) / len(decided)) if decided else None,
        'n_dangerous': n_dangerous,
        'dangerous_rate': n_dangerous / max(n, 1),
        'dish_accuracy': dish_ok / max(len(dish_rows), 1),
        'n_agree': len(agree), 'n_disagree': len(disagree),
        'diet_acc_when_agree': (sum(r['diet_correct'] for r in agree) / len(agree)) if agree else None,
        'diet_acc_when_disagree': (sum(r['diet_correct'] for r in disagree) / len(disagree)) if disagree else None,
        'coverage_reliable': len(rel) / max(n, 1),
        'diet_acc_when_reliable': (sum(r['diet_correct'] for r in rel) / len(rel)) if rel else None,
        'missing_folders': missing,
    }
    _met = os.path.join(ROOT, 'results', 'metrics')
    os.makedirs(_met, exist_ok=True)
    with open(os.path.join(_met, f'benchmark_summary{suffix}.json'), 'w') as f:
        json.dump(summary, f, indent=2)
    print('\n' + '-' * 68)
    print('SAFETY')
    print('-' * 68)
    print(f'  dangerous calls (meat or dairy reported as free of it)   {n_dangerous}')
    print(f'  abstentions ("no meat detected", dish not identified)    {n_abstained}')
    if decided:
        print(f'  accuracy on the {len(decided)} it decided                        '
              f'{sum(r["diet_correct"] for r in decided)/len(decided)*100:.2f}%')

    print(f'\nSaved: {csv_path}')


if __name__ == '__main__':
    main()
