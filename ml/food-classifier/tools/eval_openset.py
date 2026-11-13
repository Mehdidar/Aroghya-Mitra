"""
eval_openset.py
---------------
Does CLIP k-NN distance detect out-of-distribution food better than the dish
head's own softmax confidence?

  in-distribution   48 restaurant photos of the 26 known dishes
  out-of-distribution  German dish photos — a different cuisine entirely,
                       none of which is one of the 26 classes

Reports AUROC for both signals and the false-positive rate each achieves at
95% true-positive rate, i.e. how much unknown food slips through while
letting 95% of known food past.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import json
import random

import numpy as np
import torch
from sklearn.metrics import roc_auc_score, roc_curve

from core.config import HEADS, ROOT, VALID_EXTS
from core.models import FoodClassifier
from core.utils import get_transforms
from core.openset import OpenSetDetector

random.seed(0)
RESTAURANT = os.path.join(ROOT, 'datasets', 'benchmark')            # in-distribution: held-out Indian photos
GERMAN = os.path.join(ROOT, 'datasets', 'out_of_distribution')  # any non-Indian food photos


def gather(root, limit=None):
    fs = [os.path.join(r, f) for r, _, files in os.walk(root) for f in sorted(files)
          if os.path.splitext(f)[1].lower() in VALID_EXTS]
    if limit and len(fs) > limit:
        fs = random.sample(fs, limit)
    return sorted(fs)


def softmax_conf(files):
    """Max softmax of the dish head — the current open-set guard."""
    spec = HEADS['dish']
    mapping = json.load(open(os.path.join(spec['results_dir'], 'class_mapping.json')))
    model = FoodClassifier(num_classes=len(mapping), freeze_backbone=False,
                           architecture=spec['architecture'])
    model.load_state_dict(torch.load(spec['checkpoint'], map_location='cpu'))
    device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
    model.to(device).eval()
    _, tf = get_transforms(spec['img_size'])

    from PIL import Image
    out = []
    for i in range(0, len(files), 32):
        batch = []
        for f in files[i:i + 32]:
            batch.append(tf(Image.open(f).convert('RGB')))
        with torch.no_grad():
            p = torch.softmax(model(torch.stack(batch).to(device)), dim=1).cpu()
        out += p.max(1).values.tolist()
    return np.array(out)


def report(name, s_in, s_out):
    y = np.r_[np.ones(len(s_in)), np.zeros(len(s_out))]
    s = np.r_[s_in, s_out]
    auc = roc_auc_score(y, s)
    fpr, tpr, thr = roc_curve(y, s)
    i = int(np.argmin(np.abs(tpr - 0.95)))
    print(f'  {name:26s} AUROC {auc:.3f}   at {tpr[i]*100:.0f}% TPR: '
          f'{fpr[i]*100:5.1f}% of unknown food slips through  (threshold {thr[i]:.3f})')
    # keep the curve so the chart can be drawn without re-running inference
    step = max(1, len(fpr) // 300)
    return {'auroc': float(auc), 'tpr': float(tpr[i]), 'fpr': float(fpr[i]),
            'threshold': float(thr[i]),
            'curve': {'fpr': [round(float(x), 5) for x in fpr[::step]],
                      'tpr': [round(float(x), 5) for x in tpr[::step]]}}


def main():
    in_files = gather(RESTAURANT)
    out_files = gather(GERMAN, limit=600)
    print(f'in-distribution : {len(in_files)} restaurant photos (26 known dishes)')
    print(f'out-of-distribution: {len(out_files)} German dish photos\n')

    det = OpenSetDetector()
    print('scoring ...')
    clip_in, clip_out = det.scores(in_files), det.scores(out_files)
    sm_in, sm_out = softmax_conf(in_files), softmax_conf(out_files)

    print('\nOPEN-SET DETECTION')
    r_sm = report('dish softmax (baseline)', sm_in, sm_out)
    r_cl = report('CLIP k-NN (this work)', clip_in, clip_out)

    print(f'\n  mean score  in-dist / OOD')
    print(f'    softmax   {sm_in.mean():.3f} / {sm_out.mean():.3f}'
          f'   gap {sm_in.mean()-sm_out.mean():+.3f}')
    print(f'    CLIP kNN  {clip_in.mean():.3f} / {clip_out.mean():.3f}'
          f'   gap {clip_in.mean()-clip_out.mean():+.3f}')

    out = os.path.join(ROOT, 'results', 'metrics', 'openset_eval.json')
    json.dump({'n_in': len(in_files), 'n_out': len(out_files),
               'softmax': {k: v for k, v in r_sm.items() if k != 'curve'},
               'clip_knn': {k: v for k, v in r_cl.items() if k != 'curve'},
               'curves': {'softmax': r_sm['curve'], 'clip_knn': r_cl['curve']}},
              open(out, 'w'), indent=2)
    print(f'\nSaved: {out}')


if __name__ == '__main__':
    main()
