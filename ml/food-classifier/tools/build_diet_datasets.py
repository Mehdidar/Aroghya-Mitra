"""
build_diet_datasets.py
----------------------
Derive the three training sets from one source, using the taxonomy as the
single source of truth for dietary labels.

Any folder whose name is a key in core/indian_taxonomy.json is treated as a
dish folder, at whatever depth it sits:

    <source>/palak_paneer/*.jpg                  flat (most public datasets)
    <source>/veg/palak_paneer/*.jpg              grouped, also fine

        -> <out>/veg_binary/{veg,non_veg}/<dish>/      (symlinks)
        -> <out>/vegan_binary/{vegan,vegetarian}/<dish>/
        -> <out>/dishes/<dish>/

The veg / non_veg label comes from the taxonomy, never from a parent folder
name, so a mislabelled parent folder cannot poison the veg head. Folder
names are matched after lower-casing and turning spaces and hyphens into
underscores ("Palak Paneer" -> palak_paneer).

Symlinks, so nothing is duplicated on disk. Folders that match no taxonomy
entry are listed and skipped: add an entry for them (or rename the folder)
and run this again.

Balancing: dishes/ keeps at most --max_per_dish images per dish, a seeded
random sample (stable per dish, so adding one dish does not reshuffle the
others). Random rather than "most diverse" on purpose: diversity sampling
over-selects outliers, and in a web-scraped set the outliers are where the
mislabelled photos are. Only dishes/ is capped. veg_binary/ and vegan_binary/
keep every image: capping them by dish would turn a mild 57/43 veg/non-veg
split into a severe one, and train.py already weights the loss by class.

    python tools/build_diet_datasets.py --source datasets/grabcut_dataset
    python tools/build_diet_datasets.py --source ... --max_per_dish 0   # no cap
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import argparse
import random
import shutil
from collections import Counter

from core import taxonomy
from core.config import VALID_EXTS

# Default cap for dishes/. Set from the cleaned dataset (see the dataset
# README): the smallest dishes have ~25-35 images, the median ~44.
MAX_PER_DISH = 60


def normalise(name):
    return name.strip().lower().replace(' ', '_').replace('-', '_')


def link(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.lexists(dst):
        os.remove(dst)
    os.symlink(os.path.abspath(src), dst)


def images_in(d):
    return [f for f in sorted(os.listdir(d))
            if os.path.splitext(f)[1].lower() in VALID_EXTS]


def cap_sample(imgs, dish, cap, seed):
    """At most `cap` of `imgs`, chosen reproducibly per dish. cap <= 0: all."""
    if cap <= 0 or len(imgs) <= cap:
        return list(imgs)
    return sorted(random.Random(f'{seed}:{dish}').sample(list(imgs), cap))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', default='datasets/grabcut_dataset')
    ap.add_argument('--out', default='datasets/derived')
    ap.add_argument('--min_images', type=int, default=20,
                    help='warn about dishes with fewer images than this')
    ap.add_argument('--max_per_dish', type=int, default=MAX_PER_DISH,
                    help='cap on images per dish in dishes/ only (0 = no cap)')
    ap.add_argument('--seed', type=int, default=42, help='seed for the capped sample')
    args = ap.parse_args()

    if not os.path.isdir(args.source):
        raise SystemExit(f'{args.source} does not exist')

    # The output is entirely derived, so rebuild it from scratch: a dish
    # removed from the source or relabelled in the taxonomy must not survive
    # as a stale symlink.
    for sub in ('veg_binary', 'vegan_binary', 'dishes'):
        shutil.rmtree(os.path.join(args.out, sub), ignore_errors=True)

    counts, per_dish, unknown, capped = Counter(), Counter(), Counter(), {}

    for root, dirs, _ in os.walk(args.source):
        dirs.sort()
        imgs = images_in(root)
        if not imgs or os.path.abspath(root) == os.path.abspath(args.source):
            continue
        dish = normalise(os.path.basename(root))
        tier = taxonomy.tier(dish)
        if tier is None:
            unknown[os.path.relpath(root, args.source)] = len(imgs)
            continue
        top = 'non_veg' if tier == 'non_veg' else 'veg'
        for f in imgs:
            src = os.path.join(root, f)
            link(src, os.path.join(args.out, 'veg_binary', top, dish, f))
            counts[f'veg_binary/{top}'] += 1
            if tier != 'non_veg':
                link(src, os.path.join(args.out, 'vegan_binary', tier, dish, f))
                counts[f'vegan_binary/{tier}'] += 1
        keep = cap_sample(imgs, dish, args.max_per_dish, args.seed)
        if len(keep) < len(imgs):
            capped[dish] = (len(imgs), len(keep))
        for f in keep:
            link(os.path.join(root, f), os.path.join(args.out, 'dishes', dish, f))
        counts['dishes'] += len(keep)
        per_dish[dish] += len(keep)

    if unknown:
        print(f'!! {len(unknown)} folder(s) with no taxonomy entry (SKIPPED):')
        for d, n in sorted(unknown.items()):
            print(f'     {d}  ({n} images)')
    if not per_dish:
        raise SystemExit('\nNo dish folders matched the taxonomy. Folder names '
                         'must match keys in core/indian_taxonomy.json.')

    print(f'\nBuilt under {args.out}/')
    for k, v in sorted(counts.items()):
        print(f'  {k:28s} {v:5d}')
    print(f'  {"dish classes":28s} {len(per_dish):5d}')
    if per_dish:
        lo, hi = min(per_dish.values()), max(per_dish.values())
        print(f'  {"dishes/ per class":28s} {lo}–{hi} ({hi / lo:.1f}x)')
    if capped:
        print(f'\ndishes/ capped at {args.max_per_dish} per dish '
              f'(veg_binary/ and vegan_binary/ keep all):')
        for d, (n, k) in sorted(capped.items()):
            print(f'     {d}  {n} -> {k}')

    thin = sorted((n, d) for d, n in per_dish.items() if n < args.min_images)
    if thin:
        print(f'\n!! dishes with fewer than {args.min_images} images '
              f'(too few to split three ways reliably):')
        for n, d in thin:
            print(f'     {d}  ({n})')
    absent = sorted(set(taxonomy.known_dishes()) - set(per_dish))
    if absent:
        print(f'\n{len(absent)} taxonomy dish(es) with no images yet: {absent}')


if __name__ == '__main__':
    main()
