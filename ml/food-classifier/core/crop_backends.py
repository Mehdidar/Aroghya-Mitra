"""
crop_backends.py
----------------
Pluggable food-region croppers, so the segmentation step can be swapped
without touching the predictor.

Every backend exposes:   find_box(pil_img) -> (x1, y1, x2, y2) | None

Backends and their licences:

    grabcut  OpenCV GrabCut             Apache-2.0   DEFAULT, no weights
    sam      Segment Anything (HF)      Apache-2.0   ~375MB, fetched once

Both are permissive. No copyleft dependency is used anywhere in this
project; see LICENSES.md.
"""

import numpy as np


# --------------------------------------------------------------- GrabCut

def _grabcut_box(pil_img, iters=3, max_side=320, border=0.06, rng_seed=0):
    """
    Foreground extraction with no pretrained weights at all.

    GrabCut is seeded with a rectangle inset from the frame edge, then run
    to convergence; the bounding box of the largest foreground component is
    returned. Runs on a downscaled copy for speed and is rescaled back.

    `rng_seed` pins OpenCV's global RNG. GrabCut initialises its foreground
    and background colour models with k-means, which draws from that RNG,
    so without a seed the same photograph does not give the same box: in
    roughly one call in three the models collapsed and the box came back a
    few pixels wide, was rejected by `min_area_frac`, and the predictor
    silently fell back to a centre crop. Measured on one restaurant photo,
    that moved the dietary confidence between 87.1% and 93.1% run to run.
    """
    import cv2

    cv2.setRNGSeed(rng_seed)

    rgb = np.asarray(pil_img.convert('RGB'))
    H, W = rgb.shape[:2]
    scale = min(1.0, max_side / float(max(H, W)))
    small = cv2.resize(rgb, (max(8, int(W * scale)), max(8, int(H * scale)))) if scale < 1.0 else rgb
    sh, sw = small.shape[:2]

    bx, by = int(sw * border), int(sh * border)
    rect = (bx, by, max(1, sw - 2 * bx), max(1, sh - 2 * by))

    mask = np.zeros((sh, sw), np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(cv2.cvtColor(small, cv2.COLOR_RGB2BGR), mask, rect,
                    bgd, fgd, iters, cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        return None

    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    if fg.sum() == 0:
        return None

    n, _labels, stats, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    if n <= 1:
        return None
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y, w, h, _area = stats[biggest]

    inv = 1.0 / scale if scale < 1.0 else 1.0
    return (float(x * inv), float(y * inv), float((x + w) * inv), float((y + h) * inv))


# ------------------------------------------------------------------- SAM

_sam = {}


def _sam_box(pil_img, model_id='facebook/sam-vit-base'):
    """
    Segment Anything prompted with the image centre point. Apache-2.0.
    Weights are fetched once into the HuggingFace cache.
    """
    import torch

    if 'model' not in _sam:
        from transformers import SamModel, SamProcessor
        _sam['model'] = SamModel.from_pretrained(model_id).eval()
        _sam['proc'] = SamProcessor.from_pretrained(model_id)

    W, H = pil_img.size
    inputs = _sam['proc'](pil_img, input_points=[[[[W / 2, H / 2]]]], return_tensors='pt')
    with torch.no_grad():
        out = _sam['model'](**inputs)
    masks = _sam['proc'].image_processor.post_process_masks(
        out.pred_masks.cpu(),
        inputs['original_sizes'].cpu(),
        inputs['reshaped_input_sizes'].cpu(),
    )[0][0]
    m = masks[int(out.iou_scores[0][0].argmax())].numpy()
    ys, xs = np.nonzero(m)
    if xs.size == 0:
        return None
    return (float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max()))


BACKENDS = {
    'grabcut': _grabcut_box,
    'sam': _sam_box,
}


def find_box(pil_img, backend='grabcut'):
    fn = BACKENDS.get(backend)
    if fn is None:
        raise ValueError(f'unknown crop backend {backend!r}; have {sorted(BACKENDS)}')
    try:
        return fn(pil_img)
    except Exception:
        return None
