"""
audit_dataset.py
----------------
Read-only audit of the dish image dataset. Nothing under --root is changed.

    python tools/audit_dataset.py --root datasets/indian_food_dataset
    python tools/audit_dataset.py --root datasets/indian_food_dataset --no-clip   # fast pass

Layout: <root>/<category>/<dish>/*.jpg (category = veg | non_veg) or a flat
<root>/<dish>/*.jpg. labels.csv and dishes.csv in <root> are checked against
the files on disk if they are present.

Checks
  files       unreadable or truncated, real format differs from the extension,
              smaller than --min_side, aspect ratio beyond --max_aspect,
              grayscale, near-blank, non-RGB modes, multi-frame
  metadata    labels.csv and dishes.csv rows vs the files on disk
  taxonomy    dish folders with no core/indian_taxonomy.json entry, category
              folder disagreeing with the taxonomy's diet
  duplicates  exact (sha1), near (phash Hamming distance) and re-cropped /
              overlaid copies (CLIP neighbours confirmed by SIFT geometry),
              within one dish, across dishes, and across labels.csv splits
  labels      (CLIP) out-of-fold linear probes on frozen embeddings:
              images their own dish label fits badly, images whose veg /
              non-veg folder the probe disagrees with, and zero-shot
              non-food / text / collage scores

Output (--out, default results/dataset_audit/):
  inventory.csv   one row per image with every measurement
  issues.csv      one row per (image, issue), worst first
  summary.json    counts
  report.md       readable summary
  sheets/         contact sheets of flagged images for visual review
  clip_cache.npz  embeddings keyed by sha1, so a rerun only embeds new files

CLIP flags are suspicions for a person to look at, not verdicts: visually
similar dishes (rasgulla / cham cham, chicken vs mutton curry) score low
without being mislabelled.
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import argparse
import hashlib
import json
import warnings
from collections import Counter, defaultdict

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageOps
import imagehash

from core import taxonomy
from core.config import VALID_EXTS

warnings.filterwarnings('ignore', category=UserWarning, module='PIL')
Image.MAX_IMAGE_PIXELS = 200_000_000

PIL_FORMAT_EXTS = {'JPEG': {'.jpg', '.jpeg'}, 'PNG': {'.png'}, 'BMP': {'.bmp'},
                   'WEBP': {'.webp'}}
META_FILES = {'labels.csv', 'dishes.csv', 'README.md'}

# Zero-shot prompts. A photo is suspect when a non-food prompt beats every
# food prompt by a clear margin.
FOOD_PROMPTS = ['a photo of food', 'a photo of an Indian dish',
                'a close-up photo of a plate of food', 'a photo of an Indian sweet',
                'a photo of a curry in a bowl', 'a photo of a drink in a glass']
JUNK_PROMPTS = {
    'text':       ['a screenshot with a lot of text', 'a page of printed text',
                   'a recipe card covered in text', 'a restaurant menu'],
    'collage':    ['a collage of several different photos', 'a grid of many small photos'],
    'packaged':   ['a packaged food product in a box or plastic wrapper',
                   'a product label on a packet'],
    'person':     ['a photo of a person', 'a selfie', 'a person cooking in a kitchen'],
    'graphic':    ['a cartoon drawing', 'a logo', 'a vector illustration', 'clip art'],
    'raw':        ['raw uncooked meat on a cutting board', 'raw vegetables at a market'],
}
MEAT_PROMPTS = ['a dish made with chicken', 'a dish made with mutton or lamb',
                'a dish made with fish', 'a dish made with prawns or shrimp',
                'a dish made with eggs', 'a dish made with crab', 'meat kebabs on skewers']
VEG_PROMPTS = ['a vegetarian dish with no meat', 'a dish made with paneer',
               'a dish made with lentils', 'a dish made with vegetables',
               'an Indian sweet made with milk and sugar', 'a dish made with potatoes',
               'Indian bread such as roti or naan']


# ── small helpers ──────────────────────────────────────────────────────────

class UnionFind:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)


def groups_from_pairs(n, pairs):
    uf = UnionFind(n)
    for a, b in pairs:
        uf.union(a, b)
    return np.array([uf.find(i) for i in range(n)])


def inspect_file(path):
    """Everything that can be measured from one file without a model."""
    out = {'ok': False, 'error': '', 'format': '', 'mode': '', 'n_frames': 1,
           'width': 0, 'height': 0, 'phash': '', 'colour_spread': np.nan,
           'luma_std': np.nan}
    with open(path, 'rb') as f:
        data = f.read()
    out['bytes'] = len(data)
    out['sha1'] = hashlib.sha1(data).hexdigest()
    try:
        with Image.open(path) as im:
            out['format'] = im.format or ''
            out['mode'] = im.mode
            out['n_frames'] = getattr(im, 'n_frames', 1)
            im.load()                       # full decode: raises on truncation
            im = ImageOps.exif_transpose(im)
            out['width'], out['height'] = im.size
            rgb = im.convert('RGB')
        out['phash'] = str(imagehash.phash(rgb))
        small = np.asarray(rgb.resize((64, 64)), dtype=np.int16)
        out['colour_spread'] = float((small.max(2) - small.min(2)).mean())
        out['luma_std'] = float(np.asarray(rgb.convert('L').resize((64, 64))).std())
        out['ok'] = True
    except Exception as e:                  # noqa: BLE001 — recorded, not hidden
        out['error'] = f'{type(e).__name__}: {e}'
    if data[:2] == b'\xff\xd8' and not data.rstrip(b'\x00').endswith(b'\xff\xd9'):
        out['jpeg_no_eoi'] = True
    else:
        out['jpeg_no_eoi'] = False
    return out


def scan(root):
    rows, strays = [], []
    for dirpath, dirs, files in os.walk(root):
        dirs.sort()
        for f in sorted(files):
            full = os.path.join(dirpath, f)
            rel = os.path.relpath(full, root)
            if os.path.splitext(f)[1].lower() not in VALID_EXTS:
                if f not in META_FILES and f != '.DS_Store':
                    strays.append(rel)
                continue
            parts = rel.split(os.sep)
            rows.append({'filepath': rel.replace(os.sep, '/'),
                         'dish': parts[-2] if len(parts) >= 2 else '',
                         'category': parts[-3] if len(parts) >= 3 else '',
                         'ext': os.path.splitext(f)[1].lower()})
    return rows, strays


def geometric_duplicates(paths, emb, k=10, min_cos=0.82, min_inliers=40, min_area=0.10):
    """Same-photo pairs that survived a crop, resize, recolour or text overlay.

    phash misses re-crops and CLIP cosine cannot tell "same photo" from
    "another photo of the same dish" (both land around 0.85-0.95). So CLIP
    only proposes candidates (each image's k nearest neighbours above
    min_cos, any dish), and a SIFT + RANSAC homography decides: the same
    photograph gives hundreds of geometrically consistent matches, two
    different photos a handful. The inliers must also cover min_area of the
    smaller image, so a shared blog watermark alone does not count.

    Returns [(i, j, inliers, cos)].
    """
    import cv2
    S = emb @ emb.T
    np.fill_diagonal(S, -1)
    nn = np.argsort(-S, axis=1)[:, :k]
    cand = {(min(i, j), max(i, j)) for i in range(len(emb)) for j in nn[i] if S[i, j] >= min_cos}

    sift = cv2.SIFT_create(nfeatures=1500)
    feats = {}

    def get(i):
        if i not in feats:
            im = cv2.imread(paths[i], cv2.IMREAD_GRAYSCALE)
            h, w = im.shape
            s = 512 / max(h, w)
            if s < 1:
                im = cv2.resize(im, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
            kp, des = sift.detectAndCompute(im, None)
            feats[i] = (np.float32([p.pt for p in kp]), des, im.shape[0] * im.shape[1])
        return feats[i]

    bf = cv2.BFMatcher()
    out = []
    from tqdm import tqdm
    for i, j in tqdm(sorted(cand), desc='geometric verify'):
        pa, da, area_a = get(i)
        pb, db, area_b = get(j)
        if da is None or db is None or len(pa) < 8 or len(pb) < 8:
            continue
        good = [m for m, n in (p for p in bf.knnMatch(da, db, k=2) if len(p) == 2)
                if m.distance < 0.75 * n.distance]
        if len(good) < min_inliers:
            continue
        A = pa[[m.queryIdx for m in good]]
        B = pb[[m.trainIdx for m in good]]
        H, mask = cv2.findHomography(A, B, cv2.RANSAC, 5.0)
        if mask is None or mask.sum() < min_inliers:
            continue
        inl = mask.ravel().astype(bool)
        cover = min(cv2.contourArea(cv2.convexHull(A[inl])) / area_a,
                    cv2.contourArea(cv2.convexHull(B[inl])) / area_b)
        # Calibrated by eye on this dataset: every false match had < 52
        # inliers and 0.11-0.16 coverage (two different yellow curries, two
        # different kebab plates); from 60 inliers up every pair was the
        # same photo. Weak matches must therefore cover more of the frame.
        if cover >= (min_area if inl.sum() >= 60 else max(min_area, 0.17)):
            out.append((i, j, int(inl.sum()), float(S[i, j])))
    return out


def phash_pairs(hashes, threshold):
    """All index pairs within `threshold` bits. Vectorised XOR + popcount."""
    valid = [i for i, h in enumerate(hashes) if h]
    ints = np.array([int(hashes[i], 16) for i in valid], dtype=np.uint64)
    pairs, dists = [], []
    for k in range(len(ints) - 1):
        d = np.bitwise_count(ints[k] ^ ints[k + 1:])
        for j in np.nonzero(d <= threshold)[0]:
            pairs.append((valid[k], valid[k + 1 + j]))
            dists.append(int(d[j]))
    return pairs, dists


# ── CLIP ───────────────────────────────────────────────────────────────────

def load_clip(model_name, pretrained):
    os.environ.setdefault('HF_HUB_OFFLINE', '1')
    import open_clip
    import torch
    device = ('mps' if torch.backends.mps.is_available()
              else 'cuda' if torch.cuda.is_available() else 'cpu')
    model, _, preprocess = open_clip.create_model_and_transforms(model_name, pretrained=pretrained)
    tokenizer = open_clip.get_tokenizer(model_name)
    return model.to(device).eval(), preprocess, tokenizer, device, torch


def embed_images(paths, sha1s, cache_path, clip, batch_size=32):
    model, preprocess, _, device, torch = clip
    cache = {}
    if os.path.exists(cache_path):
        z = np.load(cache_path)
        cache = dict(zip(z['sha1'], z['emb']))
    todo = [i for i, s in enumerate(sha1s) if s not in cache]
    if todo:
        from tqdm import tqdm
        for b in tqdm(range(0, len(todo), batch_size), desc='CLIP embed'):
            idx = todo[b:b + batch_size]
            x = torch.stack([preprocess(ImageOps.exif_transpose(Image.open(paths[i])).convert('RGB'))
                             for i in idx]).to(device)
            with torch.no_grad():
                f = model.encode_image(x).float()
                f = f / f.norm(dim=-1, keepdim=True)
            for i, v in zip(idx, f.cpu().numpy()):
                cache[sha1s[i]] = v
        keys = sorted(cache)
        np.savez(cache_path, sha1=np.array(keys), emb=np.stack([cache[k] for k in keys]))
    return np.stack([cache[s] for s in sha1s]).astype(np.float32)


def embed_text(prompts, clip):
    model, _, tokenizer, device, torch = clip
    with torch.no_grad():
        t = model.encode_text(tokenizer(prompts).to(device)).float()
        t = t / t.norm(dim=-1, keepdim=True)
    return t.cpu().numpy()


def softmax(x, axis=-1):
    x = x - x.max(axis=axis, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=axis, keepdims=True)


def out_of_fold_proba(X, y, groups, n_splits=5, C=2.0, seed=42):
    """Group-aware out-of-fold class probabilities from a linear probe.

    Grouping by near-duplicate cluster stops an image being 'predicted' by
    its own copy in the training fold, which would hide a wrong label.
    """
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedGroupKFold
    classes = np.unique(y)
    P = np.zeros((len(y), len(classes)), dtype=np.float32)
    cv = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=seed)
    for tr, te in cv.split(X, y, groups):
        clf = LogisticRegression(C=C, max_iter=3000)
        clf.fit(X[tr], y[tr])
        cols = np.searchsorted(classes, clf.classes_)
        P[np.ix_(te, cols)] = clf.predict_proba(X[te])
    return P, classes


# ── contact sheets ─────────────────────────────────────────────────────────

def contact_sheets(items, root, out_dir, prefix, cols=6, thumb=220, per_sheet=36):
    """items: list of (filepath, caption). Writes numbered PNG grids."""
    os.makedirs(out_dir, exist_ok=True)
    written = []
    cap_h = 30
    for s in range(0, len(items), per_sheet):
        chunk = items[s:s + per_sheet]
        rows = (len(chunk) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * thumb, rows * (thumb + cap_h)), 'white')
        draw = ImageDraw.Draw(sheet)
        for k, (fp, cap) in enumerate(chunk):
            r, c = divmod(k, cols)
            x0, y0 = c * thumb, r * (thumb + cap_h)
            try:
                with Image.open(os.path.join(root, fp)) as im:
                    im = ImageOps.exif_transpose(im).convert('RGB')
                    im.thumbnail((thumb - 6, thumb - 6))
                    sheet.paste(im, (x0 + (thumb - im.width) // 2, y0 + (thumb - im.height) // 2))
            except Exception:
                draw.text((x0 + 10, y0 + 10), 'UNREADABLE', fill='red')
            draw.text((x0 + 3, y0 + thumb), f'{s + k}: {cap}'[:40], fill='black')
            draw.text((x0 + 3, y0 + thumb + 13), os.path.basename(fp)[:38], fill='gray')
        path = os.path.join(out_dir, f'{prefix}_{s // per_sheet:02d}.png')
        sheet.save(path)
        written.append(path)
    return written


# ── main ───────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--root', default='datasets/indian_food_dataset')
    ap.add_argument('--out', default='results/dataset_audit')
    ap.add_argument('--min_side', type=int, default=128)
    ap.add_argument('--max_aspect', type=float, default=3.0)
    ap.add_argument('--hash_threshold', type=int, default=5,
                    help='phash Hamming distance counted as a near-duplicate (train.py uses 5)')
    ap.add_argument('--dup_candidate_cosine', type=float, default=0.82,
                    help='CLIP cosine above which a neighbour is checked geometrically')
    ap.add_argument('--dup_min_inliers', type=int, default=40,
                    help='SIFT/RANSAC inliers that make two files the same photograph')
    ap.add_argument('--no-clip', dest='clip', action='store_false')
    ap.add_argument('--clip_model', default='ViT-L-14')
    ap.add_argument('--clip_pretrained', default='laion2b_s32b_b82k')
    ap.add_argument('--no-sheets', dest='sheets', action='store_false')
    args = ap.parse_args()

    root = args.root
    os.makedirs(args.out, exist_ok=True)
    rows, strays = scan(root)
    if not rows:
        raise SystemExit(f'no images under {root}')
    print(f'{len(rows)} images under {root}')

    from tqdm import tqdm
    for r in tqdm(rows, desc='inspect'):
        r.update(inspect_file(os.path.join(root, r['filepath'])))
    inv = pd.DataFrame(rows)
    inv['aspect'] = (inv[['width', 'height']].max(axis=1)
                     / inv[['width', 'height']].min(axis=1).replace(0, np.nan))
    issues = []   # (filepath, check, severity, detail)

    def flag(fp, check, severity, detail=''):
        issues.append({'filepath': fp, 'check': check, 'severity': severity, 'detail': detail})

    # ── file checks ──
    for r in inv.itertuples():
        if not r.ok:
            flag(r.filepath, 'unreadable', 'high', r.error)
            continue
        if r.format and r.ext not in PIL_FORMAT_EXTS.get(r.format, {r.ext}):
            flag(r.filepath, 'format_mismatch', 'low', f'{r.format} saved as {r.ext}')
        if r.jpeg_no_eoi:
            flag(r.filepath, 'jpeg_truncated', 'medium', 'no end-of-image marker')
        if min(r.width, r.height) < args.min_side:
            flag(r.filepath, 'too_small', 'medium', f'{r.width}x{r.height}')
        if r.aspect > args.max_aspect:
            flag(r.filepath, 'extreme_aspect', 'medium', f'{r.aspect:.2f}:1')
        if r.colour_spread < 6:
            flag(r.filepath, 'grayscale', 'medium', f'spread {r.colour_spread:.1f}')
        if r.luma_std < 8:
            flag(r.filepath, 'near_blank', 'medium', f'luma std {r.luma_std:.1f}')
        if r.mode not in ('RGB', 'L'):
            flag(r.filepath, 'non_rgb_mode', 'low', r.mode)
        if r.n_frames > 1:
            flag(r.filepath, 'multi_frame', 'low', f'{r.n_frames} frames')

    # ── metadata checks ──
    meta = {'stray_files': strays}
    labels_path = os.path.join(root, 'labels.csv')
    split_of = {}
    if os.path.exists(labels_path):
        lab = pd.read_csv(labels_path)
        on_disk = set(inv.filepath)
        in_csv = set(lab.filepath)
        meta['labels_rows'] = len(lab)
        meta['labels_duplicate_rows'] = int(lab.filepath.duplicated().sum())
        meta['labels_rows_without_file'] = sorted(in_csv - on_disk)
        meta['files_without_labels_row'] = sorted(on_disk - in_csv)
        merged = inv.merge(lab, on='filepath', how='inner', suffixes=('', '_csv'))
        meta['labels_dish_mismatch'] = merged.loc[merged.dish != merged.dish_csv, 'filepath'].tolist()
        meta['labels_category_mismatch'] = merged.loc[
            merged.category != merged.category_csv, 'filepath'].tolist()
        if 'width' in lab:
            m = merged[(merged.width != merged.width_csv) | (merged.height != merged.height_csv)]
            meta['labels_size_mismatch'] = len(m)
        if 'split' in lab:
            split_of = dict(zip(lab.filepath, lab.split))
            meta['labels_split_counts'] = lab.split.value_counts().to_dict()
        if 'source' in lab:
            src = dict(zip(lab.filepath, lab.source))
            inv['source'] = inv.filepath.map(src).fillna('')
    dishes_path = os.path.join(root, 'dishes.csv')
    if os.path.exists(dishes_path):
        dcsv = pd.read_csv(dishes_path)
        actual = inv.dish.value_counts()
        mism = []
        for d in dcsv.itertuples():
            n = int(actual.get(d.dish, 0))
            if n != d.image_count:
                mism.append({'dish': d.dish, 'dishes_csv': int(d.image_count), 'on_disk': n})
        meta['dishes_csv_count_mismatch'] = mism
        meta['dishes_missing_from_dishes_csv'] = sorted(set(inv.dish) - set(dcsv.dish))

    # ── taxonomy checks ──
    known = set(taxonomy.known_dishes())
    dish_cat = inv.groupby('dish').category.agg(lambda s: sorted(set(s)))
    tax = {'not_in_taxonomy': {}, 'category_conflict': {}, 'taxonomy_without_images': []}
    for dish, cats in dish_cat.items():
        n = int((inv.dish == dish).sum())
        t = taxonomy.tier(dish)
        if t is None:
            tax['not_in_taxonomy'][dish] = {'category': cats, 'images': n}
            continue
        expect = 'non_veg' if t == 'non_veg' else 'veg'
        if any(c and c != expect for c in cats):
            tax['category_conflict'][dish] = {'folder': cats, 'taxonomy': t}
    tax['taxonomy_without_images'] = sorted(known - set(inv.dish))
    tax['tier_of_matched'] = Counter(taxonomy.tier(d) for d in set(inv.dish) & known)

    # ── duplicates ──
    ok = inv.ok.values
    idx_ok = np.nonzero(ok)[0]
    exact_groups = inv[ok].groupby('sha1').filepath.apply(list)
    exact_groups = exact_groups[exact_groups.map(len) > 1]
    pairs, dists = phash_pairs(inv.phash.tolist(), args.hash_threshold)
    dup_pairs = [{'a': inv.filepath[a], 'b': inv.filepath[b], 'phash_dist': d}
                 for (a, b), d in zip(pairs, dists)]

    # ── CLIP ──
    clip_meta = {}
    emb = None
    if args.clip:
        clip = load_clip(args.clip_model, args.clip_pretrained)
        paths = [os.path.join(root, fp) for fp in inv.filepath[ok]]
        emb_ok = embed_images(paths, inv.sha1[ok].tolist(),
                              os.path.join(args.out, f'clip_cache_{args.clip_model}.npz'), clip)
        emb = np.zeros((len(inv), emb_ok.shape[1]), np.float32)
        emb[idx_ok] = emb_ok

        # same photo re-cropped / resized / overlaid: CLIP proposes, SIFT confirms
        seen = {(min(a, b), max(a, b)) for a, b in pairs}
        for i, j, inliers, cos in geometric_duplicates(paths, emb_ok, min_cos=args.dup_candidate_cosine,
                                                       min_inliers=args.dup_min_inliers):
            a, b = idx_ok[i], idx_ok[j]
            if (a, b) not in seen:
                pairs.append((a, b))
                dup_pairs.append({'a': inv.filepath[a], 'b': inv.filepath[b],
                                  'phash_dist': int(np.bitwise_count(
                                      np.uint64(int(inv.phash[a], 16)) ^ np.uint64(int(inv.phash[b], 16)))),
                                  'clip_cos': round(cos, 4), 'sift_inliers': inliers})

        # zero-shot: food vs junk
        junk_names = [k for k, v in JUNK_PROMPTS.items() for _ in v]
        junk_prompts = [p for v in JUNK_PROMPTS.values() for p in v]
        T = embed_text(FOOD_PROMPTS + junk_prompts, clip)
        prob = softmax(100.0 * emb_ok @ T.T)
        food_p = prob[:, :len(FOOD_PROMPTS)].sum(1)
        junk_p = prob[:, len(FOOD_PROMPTS):]
        junk_kind = np.array([junk_names[k] for k in junk_p.argmax(1)])
        junk_by_kind = defaultdict(lambda: np.zeros(len(idx_ok)))
        for k, name in enumerate(junk_names):
            junk_by_kind[name] += junk_p[:, k]
        inv['food_p'] = np.nan
        inv.loc[idx_ok, 'food_p'] = food_p
        inv['junk_kind'] = ''
        inv.loc[idx_ok, 'junk_kind'] = [max(junk_by_kind, key=lambda n: junk_by_kind[n][i])
                                        for i in range(len(idx_ok))]
        inv.loc[idx_ok, 'junk_p'] = 1 - food_p

        # zero-shot: meat vs veg
        T2 = embed_text(MEAT_PROMPTS + VEG_PROMPTS, clip)
        p2 = softmax(100.0 * emb_ok @ T2.T)
        inv['zs_meat_p'] = np.nan
        inv.loc[idx_ok, 'zs_meat_p'] = p2[:, :len(MEAT_PROMPTS)].sum(1)

        # out-of-fold probes, grouped by near-duplicate cluster
        g = groups_from_pairs(len(inv), pairs)[idx_ok]
        y_dish = inv.dish.values[idx_ok]
        P, classes = out_of_fold_proba(emb_ok, y_dish, g)
        own = P[np.arange(len(y_dish)), np.searchsorted(classes, y_dish)]
        top = P.argmax(1)
        inv['dish_p_own'] = np.nan
        inv.loc[idx_ok, 'dish_p_own'] = own
        inv['dish_pred'] = ''
        inv.loc[idx_ok, 'dish_pred'] = classes[top]
        inv.loc[idx_ok, 'dish_p_pred'] = P.max(1)
        clip_meta['dish_probe_oof_acc'] = float((classes[top] == y_dish).mean())

        cats = inv.category.values[idx_ok]
        if set(cats) >= {'veg', 'non_veg'}:
            Pc, cc = out_of_fold_proba(emb_ok, cats, g, C=1.0)
            nv = Pc[:, list(cc).index('non_veg')]
            inv['probe_non_veg_p'] = np.nan
            inv.loc[idx_ok, 'probe_non_veg_p'] = nv
            clip_meta['veg_probe_oof_acc'] = float(((nv > 0.5) == (cats == 'non_veg')).mean())

        for r in inv.loc[idx_ok].itertuples():
            if r.junk_p > 0.6:
                flag(r.filepath, f'zs_{r.junk_kind}', 'review', f'non-food p={r.junk_p:.2f}')
            if r.dish_p_own < 0.05 and r.dish_p_pred > 0.5:
                flag(r.filepath, 'dish_label_suspect', 'review',
                     f'p(own)={r.dish_p_own:.2f}, looks like {r.dish_pred} ({r.dish_p_pred:.2f})')
            if 'probe_non_veg_p' in inv:
                nv_p = r.probe_non_veg_p
                if r.category == 'veg' and (nv_p > 0.5 or r.zs_meat_p > 0.85):
                    flag(r.filepath, 'veg_folder_looks_non_veg', 'review',
                         f'probe={nv_p:.2f} zero-shot meat={r.zs_meat_p:.2f}')
                if r.category == 'non_veg' and (nv_p < 0.5 or r.zs_meat_p < 0.10):
                    flag(r.filepath, 'non_veg_folder_looks_veg', 'review',
                         f'probe={nv_p:.2f} zero-shot meat={r.zs_meat_p:.2f}')

    # ── duplicate findings ──
    g_all = groups_from_pairs(len(inv), pairs)
    inv['dup_group'] = g_all
    sizes = Counter(g_all)
    for gid, n in sizes.items():
        if n < 2:
            continue
        members = inv[inv.dup_group == gid]
        dishes = sorted(set(members.dish))
        exact = members.sha1.nunique() < len(members)
        kind = ('cross_dish_duplicate' if len(dishes) > 1 else 'duplicate')
        for fp in members.filepath:
            flag(fp, kind, 'high' if len(dishes) > 1 else 'medium',
                 f'group of {n}{" (exact copies present)" if exact else ""}; dishes={dishes}')
        if split_of:
            splits = {split_of.get(fp) for fp in members.filepath} - {None}
            if len(splits) > 1:
                for fp in members.filepath:
                    flag(fp, 'split_leak', 'high', f'group spans labels.csv splits {sorted(splits)}')

    iss = pd.DataFrame(issues, columns=['filepath', 'check', 'severity', 'detail'])
    sev_rank = {'high': 0, 'medium': 1, 'review': 2, 'low': 3}
    iss = iss.assign(_r=iss.severity.map(sev_rank)).sort_values(['_r', 'check', 'filepath']).drop(columns='_r')
    inv.to_csv(os.path.join(args.out, 'inventory.csv'), index=False)
    iss.to_csv(os.path.join(args.out, 'issues.csv'), index=False)
    pd.DataFrame(dup_pairs).to_csv(os.path.join(args.out, 'duplicate_pairs.csv'), index=False)

    # ── summary ──
    per_dish = inv.groupby(['category', 'dish']).size().rename('images').reset_index()
    counts = per_dish.images
    summary = {
        'root': root,
        'images': len(inv),
        'readable': int(inv.ok.sum()),
        'dishes': int(inv.dish.nunique()),
        'per_category_images': inv.category.value_counts().to_dict(),
        'per_category_dishes': per_dish.category.value_counts().to_dict(),
        'dish_count_min': int(counts.min()), 'dish_count_median': float(counts.median()),
        'dish_count_max': int(counts.max()),
        'imbalance_ratio': round(float(counts.max() / counts.min()), 2),
        'issues_by_check': iss.check.value_counts().to_dict(),
        'images_with_issues': int(iss.filepath.nunique()),
        'exact_duplicate_groups': len(exact_groups),
        'near_duplicate_groups': int(sum(1 for n in sizes.values() if n > 1)),
        'metadata': {k: (v if not isinstance(v, list) or len(v) < 30 else f'{len(v)} items')
                     for k, v in meta.items()},
        'taxonomy': tax,
        'clip': clip_meta,
    }
    with open(os.path.join(args.out, 'summary.json'), 'w') as f:
        json.dump(summary, f, indent=2, default=str)
    per_dish.sort_values('images').to_csv(os.path.join(args.out, 'per_dish_counts.csv'), index=False)

    # ── contact sheets for review ──
    if args.sheets:
        sheet_dir = os.path.join(args.out, 'sheets')
        for check in sorted(iss.check.unique()):
            sub = iss[iss.check == check].drop_duplicates('filepath')
            if check in ('duplicate', 'cross_dish_duplicate', 'split_leak'):
                continue   # reviewed as pairs below
            items = [(r.filepath, f'{r.filepath.split("/")[-2]} {r.detail}') for r in sub.itertuples()]
            contact_sheets(items, root, sheet_dir, check)
        dups = inv[inv.dup_group.isin([gid for gid, n in sizes.items() if n > 1])].copy()
        if len(dups):
            dups['cross_dish'] = dups.groupby('dup_group').dish.transform('nunique') > 1
            dups = dups.sort_values(['cross_dish', 'dup_group'], ascending=[False, True])
            items = [(r.filepath, f'g{r.dup_group}{" CROSS" if r.cross_dish else ""} {r.width}x{r.height}')
                     for r in dups.itertuples()]
            contact_sheets(items, root, sheet_dir, 'duplicate_groups', cols=6, per_sheet=48)

    # ── report ──
    lines = [f'# Dataset audit: `{root}`', '',
             f'{summary["images"]} images, {summary["dishes"]} dishes, '
             f'{summary["readable"]} readable.', '',
             '## Class balance', '',
             f'Images per dish: min {summary["dish_count_min"]}, median {summary["dish_count_median"]:.0f}, '
             f'max {summary["dish_count_max"]} (ratio {summary["imbalance_ratio"]}x).', '',
             f'Per category: {summary["per_category_images"]}', '',
             '## Issues by check', '', '| check | images |', '|---|---|']
    lines += [f'| {k} | {v} |' for k, v in summary['issues_by_check'].items()]
    lines += ['', '## Metadata', '']
    lines += [f'- {k}: {v}' for k, v in summary['metadata'].items()]
    lines += ['', '## Taxonomy', '',
              f'- dishes with no taxonomy entry: {len(tax["not_in_taxonomy"])} '
              f'({sum(v["images"] for v in tax["not_in_taxonomy"].values())} images) '
              f'— build_diet_datasets.py skips these',
              f'- category folder vs taxonomy conflicts: {tax["category_conflict"] or "none"}',
              f'- taxonomy dishes with no images: {tax["taxonomy_without_images"]}']
    if clip_meta:
        lines += ['', '## CLIP probes', '', f'- {clip_meta}']
    with open(os.path.join(args.out, 'report.md'), 'w') as f:
        f.write('\n'.join(lines) + '\n')

    print(json.dumps({k: summary[k] for k in ('images', 'readable', 'dishes', 'imbalance_ratio',
                                               'issues_by_check', 'images_with_issues', 'clip')},
                     indent=2, default=str))
    print(f'\nwrote {args.out}/ (report.md, issues.csv, inventory.csv, sheets/)')


if __name__ == '__main__':
    main()
