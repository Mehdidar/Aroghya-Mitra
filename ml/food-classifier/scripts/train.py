"""
train.py
--------
Two-stage transfer learning: frozen backbone, then full fine-tuning.

Fixes over the previous version:

  * `--arch` and `--run` are separate. The old `--model` conflated the
    architecture with the experiment name and dispatched by substring, so
    `mobilenet_v3_small` would silently have built a Large.
  * EarlyStopping state is fully reset between stages. Previously `best_loss`
    carried over, so if fine-tuning never beat the frozen-backbone loss the
    shipped checkpoint was the stage-1 model while the logs claimed two-stage
    fine-tuning.
  * The held-out test split is now evaluated at the end instead of being
    computed and discarded.
  * Frozen BatchNorm layers stay in eval during stage 1 (see core/models).
  * Near-duplicate grouping is transitive (see core.utils._group_near_duplicates).

  * `--init` warm-starts from an existing checkpoint instead of ImageNet.
    Layers whose shape differs (the final classifier, when the class count
    changes) keep their fresh initialisation; everything else is loaded.
    `--init saudi` picks the matching checkpoint in
    checkpoints/pretrained_saudi from the run name (dish_/veg_/vegan_).

Usage:
    python scripts/train.py --dataset datasets/derived/veg_binary \
        --run veg_indian --img_size 344 --init saudi
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import json
import argparse

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from tqdm import tqdm

from core.models import FoodClassifier
from core.utils import (
    get_device, FoodDataset, get_transforms,
    prepare_data, prepare_data_three_way, EarlyStopping, plot_training_curves,
)

from core.config import BASELINES

ARCHITECTURES = ['mobilenet_v3_large', 'efficientnet_b2']


def resolve_init(init, run):
    """'saudi' -> the baseline whose head matches the run name's prefix."""
    if init != 'saudi':
        return init
    head = run.split('_')[0]
    if head not in BASELINES:
        raise SystemExit(f"--init saudi needs a run name starting with one of "
                         f"{sorted(BASELINES)} (got '{run}')")
    return BASELINES[head]['checkpoint']


def warm_start(model, path):
    """Load every tensor whose name and shape match; report the rest.

    The veg and vegan heads have the same two classes as their Saudi
    parents, so they load completely. The dish head has a different class
    count, so its final layer is skipped and trains from scratch.
    """
    state = torch.load(path, map_location='cpu')
    own = model.state_dict()
    keep = {k: v for k, v in state.items() if k in own and v.shape == own[k].shape}
    skipped = sorted(k for k in state if k not in keep)
    own.update(keep)
    model.load_state_dict(own)
    print(f'[init] {path}')
    print(f'[init] loaded {len(keep)}/{len(own)} tensors'
          + (f'; re-initialised: {skipped}' if skipped else ' (complete)'))
    return skipped


def run_epoch(model, loader, criterion, device, optimizer=None, desc='Train'):
    train = optimizer is not None
    model.train() if train else model.eval()
    loss_sum, correct, total = 0.0, 0, 0
    ctx = torch.enable_grad() if train else torch.no_grad()
    with ctx:
        for inputs, labels in tqdm(loader, desc=desc, leave=False):
            inputs, labels = inputs.to(device), labels.to(device)
            if train:
                optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            if train:
                loss.backward()
                optimizer.step()
            loss_sum += loss.item() * inputs.size(0)
            correct += (outputs.argmax(1) == labels).sum().item()
            total += labels.size(0)
    return loss_sum / max(total, 1), correct / max(total, 1)


def train(args):
    device = get_device()
    results_dir = os.path.join('results', 'runs', args.run)
    ckpt_path = f'checkpoints/{args.run}_best.pth'
    os.makedirs('checkpoints', exist_ok=True)
    os.makedirs(results_dir, exist_ok=True)

    test_files = test_labels = None
    if args.two_way_split:
        train_files, train_labels, val_files, val_labels, class_weights = prepare_data(
            args.dataset, val_size=0.2, seed=args.seed,
            hash_threshold=args.hash_threshold, results_dir=results_dir)
    else:
        (train_files, train_labels, val_files, val_labels,
         test_files, test_labels, class_weights) = prepare_data_three_way(
            args.dataset, train_size=0.70, val_size=0.15, seed=args.seed,
            hash_threshold=args.hash_threshold, results_dir=results_dir,
            freeze_test=not args.reshuffle_test)
        print(f'[3-way] train={len(train_files)} val={len(val_files)} '
              f'test={len(test_files)} (test held out until the end)')

    train_tf, val_tf = get_transforms(args.img_size)
    train_loader = DataLoader(FoodDataset(train_files, train_labels, train_tf),
                              batch_size=args.batch_size, shuffle=True,
                              num_workers=args.num_workers)
    val_loader = DataLoader(FoodDataset(val_files, val_labels, val_tf),
                            batch_size=args.batch_size, shuffle=False,
                            num_workers=args.num_workers)

    num_classes = len(class_weights)
    # With --init every backbone weight is replaced, so skip the ImageNet download.
    model = FoodClassifier(num_classes=num_classes, freeze_backbone=True,
                           architecture=args.arch, pretrained=not args.init)
    init_path = None
    if args.init:
        init_path = resolve_init(args.init, args.run)
        warm_start(model, init_path)
    model = model.to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights.to(device), label_smoothing=0.1)

    history = {'train_loss': [], 'train_acc': [], 'val_loss': [], 'val_acc': [], 'stage': []}
    stopper = EarlyStopping(patience=args.patience, path=ckpt_path)

    def do_stage(stage, epochs, optimizer, scheduler, step_on_val):
        for epoch in range(1, epochs + 1):
            tr_l, tr_a = run_epoch(model, train_loader, criterion, device, optimizer, 'Train')
            va_l, va_a = run_epoch(model, val_loader, criterion, device, None, 'Val')
            scheduler.step(va_l) if step_on_val else scheduler.step()
            print(f'  [S{stage}] epoch {epoch}/{epochs}  '
                  f'train {tr_l:.4f}/{tr_a:.4f}   val {va_l:.4f}/{va_a:.4f}')
            for k, v in zip(('train_loss','train_acc','val_loss','val_acc','stage'),
                            (tr_l, tr_a, va_l, va_a, stage)):
                history[k].append(v)
            stopper(va_l, model)
            if stopper.early_stop:
                print(f'  early stop in stage {stage}')
                break

    print('\n--- STAGE 1: classifier head only (backbone frozen, BN in eval) ---')
    opt1 = torch.optim.AdamW(model.model.classifier.parameters(), lr=args.lr, weight_decay=0.05)
    sch1 = torch.optim.lr_scheduler.ReduceLROnPlateau(opt1, mode='min', patience=2, factor=0.5)
    do_stage(1, args.stage1_epochs, opt1, sch1, step_on_val=True)

    model.load_state_dict(torch.load(ckpt_path, map_location=device))

    print('\n--- STAGE 2: full fine-tuning ---')
    model.unfreeze_backbone()
    # Full reset. Carrying best_loss across stages meant stage 2 could never
    # save a checkpoint unless it beat the frozen-backbone loss outright.
    stopper = EarlyStopping(patience=args.patience, path=ckpt_path)
    opt2 = torch.optim.AdamW(model.parameters(), lr=args.lr * 0.01, weight_decay=0.05)
    sch2 = torch.optim.lr_scheduler.CosineAnnealingLR(opt2, T_max=args.stage2_epochs, eta_min=1e-6)
    do_stage(2, args.stage2_epochs, opt2, sch2, step_on_val=False)

    with open(os.path.join(results_dir, 'metrics.json'), 'w') as f:
        json.dump(history, f)
    plot_training_curves(history, os.path.join(results_dir, 'training_curves.png'))

    summary = {'run': args.run, 'arch': args.arch, 'img_size': args.img_size,
               'init': init_path or 'imagenet',
               'dataset': args.dataset, 'seed': args.seed,
               'num_classes': num_classes, 'epochs_run': len(history['train_loss']),
               'best_val_loss': min(history['val_loss']),
               'best_val_acc': max(history['val_acc'])}

    # ---- held-out test evaluation ----
    if test_files is not None and len(test_files):
        model.load_state_dict(torch.load(ckpt_path, map_location=device))
        test_loader = DataLoader(FoodDataset(test_files, test_labels, val_tf),
                                 batch_size=args.batch_size, shuffle=False,
                                 num_workers=args.num_workers)
        te_l, te_a = run_epoch(model, test_loader, criterion, device, None, 'Test')
        summary.update({'test_loss': te_l, 'test_acc': te_a, 'test_n': len(test_files)})
        print(f'\nHELD-OUT TEST: acc={te_a*100:.2f}%  loss={te_l:.4f}  (n={len(test_files)})')

    with open(os.path.join(results_dir, 'train_summary.json'), 'w') as f:
        json.dump(summary, f, indent=2)
    print(f'\nSaved checkpoint: {ckpt_path}')
    print(f'Saved results:    {results_dir}/')
    return summary


if __name__ == '__main__':
    p = argparse.ArgumentParser(description='Train a food classifier')
    p.add_argument('--dataset', required=True)
    p.add_argument('--arch', default='mobilenet_v3_large', choices=ARCHITECTURES)
    p.add_argument('--run', required=True, help='experiment name (checkpoint + results dir)')
    p.add_argument('--img_size', type=int, default=344)
    p.add_argument('--batch_size', type=int, default=32)
    p.add_argument('--num_workers', type=int, default=0)
    p.add_argument('--lr', type=float, default=1e-3)
    p.add_argument('--stage1_epochs', type=int, default=12)
    p.add_argument('--stage2_epochs', type=int, default=20)
    p.add_argument('--patience', type=int, default=6)
    p.add_argument('--seed', type=int, default=42)
    p.add_argument('--hash_threshold', type=int, default=5)
    p.add_argument('--init', default=None,
                   help="warm-start checkpoint path, or 'saudi' for the matching "
                        "checkpoints/pretrained_saudi model (default: ImageNet)")
    p.add_argument('--two_way_split', action='store_true', help='legacy 80/20, no test set')
    p.add_argument('--reshuffle_test', action='store_true',
                   help='re-draw the test split from scratch instead of honouring the frozen one '
                        '(breaks comparability with previous runs)')
    args = p.parse_args()

    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)
    train(args)
