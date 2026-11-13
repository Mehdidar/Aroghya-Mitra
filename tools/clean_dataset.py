"""
clean_dataset.py
----------------
Apply reviewed cleaning decisions to the dataset. Nothing is deleted.

    python tools/clean_dataset.py --decisions results/dataset_audit/decisions.csv
    python tools/clean_dataset.py --decisions ... --dry-run

decisions.csv columns:
    filepath   path relative to --root, e.g. non_veg/kofta/kofta_007.jpg
    action     reject | relabel
    reason     short slug; rejected files go to <rejected>/<reason>/
    dest       relabel only: <category>/<dish> to move the image into
    note       free text, copied into the log

  reject   moves the file to <rejected>/<reason>/<filepath> and appends a row
           to <rejected>/rejected_log.csv
  relabel  moves the file into <root>/<dest>/, renamed <dish>_r<NNN>.jpg so it
           cannot collide, and logs the move in <rejected>/relabel_log.csv

Afterwards labels.csv and dishes.csv in --root are rewritten from what is on
disk: rows for moved-out files are dropped, relabelled rows follow their
file, and image counts are recounted. Applying the same decisions twice is a
no-op (rows whose file is already gone are reported and skipped).
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import argparse
import shutil
from datetime import date

import pandas as pd

from core.config import VALID_EXTS

LOG_COLS = ['filepath', 'reason', 'note', 'date']
RELABEL_COLS = ['old_filepath', 'new_filepath', 'reason', 'note', 'date']


def append_csv(path, rows, cols):
    if not rows:
        return
    df = pd.DataFrame(rows, columns=cols)
    df.to_csv(path, mode='a', header=not os.path.exists(path), index=False)


def next_free(dest_dir, dish):
    n = 1
    while os.path.exists(os.path.join(dest_dir, f'{dish}_r{n:03d}.jpg')):
        n += 1
    return f'{dish}_r{n:03d}.jpg'


def rewrite_metadata(root):
    """labels.csv and dishes.csv are rebuilt to match the files on disk."""
    lab_path = os.path.join(root, 'labels.csv')
    dish_path = os.path.join(root, 'dishes.csv')
    on_disk = []
    for dirpath, _, files in os.walk(root):
        for f in files:
            if os.path.splitext(f)[1].lower() in VALID_EXTS:
                on_disk.append(os.path.relpath(os.path.join(dirpath, f), root).replace(os.sep, '/'))
    on_disk = set(on_disk)

    if os.path.exists(lab_path):
        lab = pd.read_csv(lab_path)
        lab = lab[lab.filepath.isin(on_disk)].copy()
        missing = sorted(on_disk - set(lab.filepath))
        if missing:
            raise SystemExit(f'{len(missing)} file(s) on disk have no labels.csv row, '
                             f'e.g. {missing[:3]} — relabel rows should have been carried over')
        lab['dish'] = lab.filepath.str.split('/').str[-2]
        lab['category'] = lab.filepath.str.split('/').str[-3]
        lab['dish_name'] = lab.dish.str.replace('_', ' ').str.title()
        lab = lab.sort_values(['category', 'dish', 'filepath'], ascending=[False, True, True])
        lab.to_csv(lab_path, index=False)

    if os.path.exists(dish_path):
        dishes = pd.read_csv(dish_path)
        counts = pd.Series([p.split('/')[-2] for p in on_disk]).value_counts()
        dishes['image_count'] = dishes.dish.map(counts).fillna(0).astype(int)
        gone = dishes[dishes.image_count == 0].dish.tolist()
        dishes = dishes[dishes.image_count > 0]
        new = sorted(set(counts.index) - set(dishes.dish))
        if new:
            cat = {p.split('/')[-2]: p.split('/')[-3] for p in on_disk}
            dishes = pd.concat([dishes, pd.DataFrame([{
                'dish': d, 'dish_name': d.replace('_', ' ').title(), 'category': cat[d],
                'protein_note': '', 'image_count': int(counts[d])} for d in new])])
        dishes.to_csv(dish_path, index=False)
        if gone:
            print(f'dishes left with no images (removed from dishes.csv): {gone}')
    return len(on_disk)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--root', default='datasets/indian_food_dataset')
    ap.add_argument('--rejected', default='datasets/indian_food_rejected')
    ap.add_argument('--decisions', required=True)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    dec = pd.read_csv(args.decisions, dtype=str).fillna('')
    bad = dec[~dec.action.isin(['reject', 'relabel'])]
    if len(bad):
        raise SystemExit(f'unknown action(s): {sorted(set(bad.action))}')
    if dec.filepath.duplicated().any():
        raise SystemExit(f'filepath listed twice: {dec[dec.filepath.duplicated()].filepath.tolist()[:5]}')
    if (dec.action.eq('relabel') & dec.dest.eq('')).any():
        raise SystemExit('relabel rows need dest=<category>/<dish>')

    lab_path = os.path.join(args.root, 'labels.csv')
    lab = pd.read_csv(lab_path) if os.path.exists(lab_path) else None
    today = date.today().isoformat()
    rejected, relabelled, skipped = [], [], []

    for d in dec.itertuples():
        src = os.path.join(args.root, d.filepath)
        if not os.path.exists(src):
            skipped.append(d.filepath)
            continue
        if d.action == 'reject':
            dst = os.path.join(args.rejected, d.reason, d.filepath)
            rejected.append({'filepath': d.filepath, 'reason': d.reason, 'note': d.note, 'date': today})
        else:
            dest_dir = os.path.join(args.root, d.dest)
            dish = d.dest.rstrip('/').split('/')[-1]
            dst = os.path.join(dest_dir, next_free(dest_dir, dish))
            new_fp = os.path.relpath(dst, args.root).replace(os.sep, '/')
            relabelled.append({'old_filepath': d.filepath, 'new_filepath': new_fp,
                               'reason': d.reason, 'note': d.note, 'date': today})
            if lab is not None and not args.dry_run:
                lab.loc[lab.filepath == d.filepath, 'filepath'] = new_fp
        if not args.dry_run:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.move(src, dst)

    print(f'reject {len(rejected)}, relabel {len(relabelled)}, '
          f'already applied / missing {len(skipped)}')
    for reason, n in pd.Series([r['reason'] for r in rejected], dtype=str).value_counts().items():
        print(f'  {reason:28s} {n}')
    if args.dry_run:
        print('dry run: nothing moved')
        return

    os.makedirs(args.rejected, exist_ok=True)
    append_csv(os.path.join(args.rejected, 'rejected_log.csv'), rejected, LOG_COLS)
    append_csv(os.path.join(args.rejected, 'relabel_log.csv'), relabelled, RELABEL_COLS)
    if lab is not None:
        lab.to_csv(lab_path, index=False)
    n = rewrite_metadata(args.root)
    print(f'{n} images remain in {args.root}; labels.csv and dishes.csv rewritten')


if __name__ == '__main__':
    main()
