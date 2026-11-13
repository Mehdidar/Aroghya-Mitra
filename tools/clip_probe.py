"""
clip_probe.py
-------------
Fits a linear classifier on frozen OpenCLIP features and compares it against
the fine-tuned MobileNetV3 head — on exactly the same splits, so the
comparison is valid. Works on any head in core.config.HEADS.

Why this is worth testing: at roughly 1,100 training images, fine-tuning 5M
parameters is the regime where a linear probe on a strong frozen encoder
often wins outright. The CLIP features already exist for open-set detection.

    python tools/clip_probe.py --head dish --views ensemble
    python tools/clip_probe.py --head veg  --views ensemble
    python tools/clip_probe.py --head dish --views ensemble --save

Regularisation strength is chosen on the VALIDATION split, never on test.
--save persists the fitted classifier so core.predictor can serve it.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import json
import time
import argparse

import numpy as np
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, classification_report

from core.config import ROOT, HEADS
from core import openset
from core.crop import crop as crop_fn

METRICS = os.path.join(ROOT, 'results', 'metrics')
CKPT = os.path.join(ROOT, 'checkpoints')
CACHE = os.path.join(ROOT, 'results', 'cache')

# Wide enough that the best C is not the largest one tried. The first run
# of this swept to 100 and stopped there with validation still climbing,
# which says nothing about whether 100 was actually the best choice.
C_GRID = (0.01, 0.1, 1.0, 10.0, 100.0, 300.0, 1000.0, 3000.0)


def load_split(head='dish'):
    spec = HEADS[head]
    mapping = json.load(open(os.path.join(spec['results_dir'], 'class_mapping.json')))
    classes = [mapping[str(i)] for i in range(len(mapping))]
    rev = {c: i for i, c in enumerate(classes)}
    info = json.load(open(os.path.join(spec['results_dir'], 'split_info.json')))

    def label(p):
        for part in reversed(p.split(os.sep)[:-1]):
            if part in rev:
                return rev[part]
        return -1

    out = {}
    for key in ('train', 'val', 'test'):
        files = [f for f in info.get(f'{key}_files', []) if os.path.exists(f)]
        ys = [label(f) for f in files]
        keep = [(f, y) for f, y in zip(files, ys) if y >= 0]
        out[key] = ([f for f, _ in keep], np.array([y for _, y in keep]))
    return classes, out


def encode(files, views='crop', batch=64):
    """Frozen CLIP features. 'crop' = food region only; 'ensemble' = mean of
    the cropped view and the full frame, mirroring how the dish head is served."""
    feats = []
    for i in range(0, len(files), batch):
        chunk = files[i:i + batch]
        imgs = []
        for p in chunk:
            im = Image.open(p).convert('RGB')
            if views == 'crop':
                imgs.append(im)
            else:
                c, _ = crop_fn(im)
                imgs.append((c, im))
        if views == 'crop':
            feats.append(openset.encode(imgs))
        else:
            a = openset.encode([x for x, _ in imgs])
            b = openset.encode([y for _, y in imgs])
            m = (a + b) / 2.0
            m /= np.linalg.norm(m, axis=1, keepdims=True)
            feats.append(m)
    return np.concatenate(feats)


def cached_encode(files, views, head, key):
    """Encode once per (head, views, split); CLIP features never change."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'clip_{head}_{views}_{key}.npz')
    if os.path.exists(path):
        z = np.load(path, allow_pickle=True)
        if list(z['files']) == list(files):
            print(f'  {key}: {len(files)} cached')
            return z['X']
    X = encode(files, views)
    np.savez(path, X=X, files=np.array(files, dtype=object))
    return X


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--head', default='dish', choices=sorted(HEADS))
    ap.add_argument('--views', default='crop', choices=['crop', 'ensemble'])
    ap.add_argument('--save', action='store_true',
                    help='persist the fitted classifier for core.predictor')
    args = ap.parse_args()

    # 'dish' keeps the original unsuffixed filenames so existing report
    # generators that read clip_probe.json carry on working.
    suffix = '' if args.head == 'dish' else f'_{args.head}'

    classes, split = load_split(args.head)
    print(f'{args.head} head splits — train {len(split["train"][0])} · '
          f'val {len(split["val"][0])} · test {len(split["test"][0])}')

    t0 = time.time()
    X, Y = {}, {}
    for key in ('train', 'val', 'test'):
        files, y = split[key]
        print(f'  encoding {key} ({len(files)}) …', flush=True)
        X[key], Y[key] = cached_encode(files, args.views, args.head, key), y
    print(f'  features: {X["train"].shape[1]}-d, {time.time()-t0:.0f}s\n')

    # regularisation chosen on validation only
    best = None
    for C in C_GRID:
        clf = LogisticRegression(C=C, max_iter=5000)
        clf.fit(X['train'], Y['train'])
        va = accuracy_score(Y['val'], clf.predict(X['val']))
        print(f'    C={C:<6g} val {va*100:5.2f}%')
        if best is None or va > best[0]:
            best = (va, C, clf)
    va, C, clf = best
    print(f'  chosen C={C} (val {va*100:.2f}%)\n')

    pred = clf.predict(X['test'])
    acc = accuracy_score(Y['test'], pred)
    mf1 = f1_score(Y['test'], pred, average='macro', zero_division=0)

    base = json.load(open(os.path.join(METRICS, 'metrics.json')))[args.head]
    print('=' * 58)
    print(f'{"":28s} {"accuracy":>10} {"macro F1":>10}')
    print('-' * 58)
    print(f'{"MobileNetV3 (fine-tuned)":28s} {base["accuracy"]*100:9.2f}% {base["macro"]["f1"]*100:9.2f}%')
    print(f'{"CLIP linear probe":28s} {acc*100:9.2f}% {mf1*100:9.2f}%')
    d = (acc - base['accuracy']) * 100
    print('-' * 58)
    print(f'{"difference":28s} {d:+9.2f}  points   (n = {len(Y["test"])})')
    print('=' * 58)

    rep = classification_report(Y['test'], pred, labels=list(range(len(classes))),
                                target_names=classes, zero_division=0, digits=3)
    with open(os.path.join(METRICS, f'clip_probe_report{suffix}.txt'), 'w') as f:
        f.write(f'CLIP linear probe — head={args.head}, views={args.views}, C={C}\n'
                f'test n={len(Y["test"])}\n\n{rep}')

    out = os.path.join(METRICS, f'clip_probe{suffix}.json')
    json.dump({'head': args.head, 'views': args.views, 'C': C, 'val_accuracy': va,
               'test_accuracy': acc, 'macro_f1': mf1, 'n': int(len(Y['test'])),
               'baseline_accuracy': base['accuracy'],
               'baseline_macro_f1': base['macro']['f1'],
               'per_class': {classes[i]: float(v) for i, v in enumerate(
                   f1_score(Y['test'], pred, average=None,
                            labels=list(range(len(classes))), zero_division=0))}},
              open(out, 'w'), indent=2)
    print(f'\nsaved {out}')

    if args.save:
        import joblib
        os.makedirs(CKPT, exist_ok=True)
        dest = os.path.join(CKPT, f'clip_probe_{args.head}.joblib')
        # `views` travels with the classifier: serving it on features built
        # a different way would silently score worse than it tested.
        joblib.dump({'clf': clf, 'classes': classes, 'views': args.views,
                     'C': C, 'head': args.head,
                     'test_accuracy': acc, 'macro_f1': mf1}, dest)
        print(f'saved {dest}  ({os.path.getsize(dest)/1024:.0f} KB)')


if __name__ == '__main__':
    main()
