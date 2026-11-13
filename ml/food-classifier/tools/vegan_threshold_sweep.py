"""
vegan_threshold_sweep.py
------------------------
The vegan head's errors run in the unsafe direction: more vegetarian dishes
called vegan than the reverse. Telling a vegan that a dairy dish is
plant-based is the one error in this system with real consequences.

Instead of argmax, require P(vegan) > tau to return "vegan". This sweeps tau
on the held-out test split and reports the safety/accuracy trade.

    unsafe errors = true vegetarian predicted vegan   (dairy sold as vegan)
    safe errors   = true vegan predicted vegetarian   (a false alarm)
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import json

import torch
from torch.utils.data import DataLoader

from core.config import HEADS, ROOT
from core.models import FoodClassifier
from core.utils import FoodDataset, get_transforms

spec = HEADS['vegan']
rd = spec['results_dir']
mapping = json.load(open(os.path.join(rd, 'class_mapping.json')))
classes = [mapping[str(i)] for i in range(len(mapping))]
VEGAN, VEGETARIAN = classes.index('vegan'), classes.index('vegetarian')

split = json.load(open(os.path.join(rd, 'split_info.json')))
rev = {v: int(k) for k, v in mapping.items()}
files, labels = [], []
for f in split['test_files']:
    cls = next((p for p in reversed(f.split(os.sep)[:-1]) if p in rev), None)
    if cls and os.path.exists(f):
        files.append(f); labels.append(rev[cls])

device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
model = FoodClassifier(num_classes=2, freeze_backbone=False, architecture=spec['architecture'])
model.load_state_dict(torch.load(spec['checkpoint'], map_location='cpu'))
model.to(device).eval()

_, tf = get_transforms(spec['img_size'])
loader = DataLoader(FoodDataset(files, labels, tf), batch_size=32, num_workers=0)

p_vegan, truth = [], []
with torch.no_grad():
    for x, y in loader:
        p = torch.softmax(model(x.to(device)), dim=1).cpu()
        p_vegan += p[:, VEGAN].tolist()
        truth += y.tolist()

n_vegan = sum(1 for t in truth if t == VEGAN)
n_veget = sum(1 for t in truth if t == VEGETARIAN)
print(f'vegan head — held-out test: n={len(truth)}  (vegan {n_vegan}, vegetarian {n_veget})')
print(f'checkpoint: {os.path.basename(spec["checkpoint"])}  img_size={spec["img_size"]}\n')
print(f"{'tau':>5} {'acc':>7} {'UNSAFE':>7} {'safe':>5} {'vegan recall':>13} {'veget recall':>13}")
print('-' * 56)

rows = []
for tau in [0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90]:
    pred = [VEGAN if p > tau else VEGETARIAN for p in p_vegan]
    correct = sum(1 for p, t in zip(pred, truth) if p == t)
    unsafe = sum(1 for p, t in zip(pred, truth) if t == VEGETARIAN and p == VEGAN)
    safe = sum(1 for p, t in zip(pred, truth) if t == VEGAN and p == VEGETARIAN)
    vr = (n_vegan - safe) / max(n_vegan, 1)
    gr = (n_veget - unsafe) / max(n_veget, 1)
    mark = ''
    rows.append({'tau': tau, 'accuracy': correct / len(truth), 'unsafe': unsafe,
                 'safe': safe, 'vegan_recall': vr, 'vegetarian_recall': gr})
    print(f'{tau:>5.2f} {correct/len(truth)*100:>6.2f}% {unsafe:>7} {safe:>5} '
          f'{vr*100:>12.1f}% {gr*100:>12.1f}%{mark}')

out = os.path.join(ROOT, 'results', 'metrics', 'vegan_threshold_sweep.json')
json.dump(rows, open(out, 'w'), indent=2)
print(f'\nSaved: {out}')
