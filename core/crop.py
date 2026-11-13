"""
crop.py
-------
Food-region cropping. Consolidates three verbatim copies of this logic that
lived in scripts/yolo_seg_crop.py, scripts/predict_hierarchical.py and
scripts/evaluate_restaurant_yolo_seg.py.

The segmentation backend is pluggable (see core/crop_backends.py):

    grabcut  OpenCV GrabCut       Apache-2.0   DEFAULT, no weights needed
    sam      Segment Anything     Apache-2.0   ~375MB on first use

No copyleft dependency is used. The previous YOLOv8 backend (ultralytics,
AGPL-3.0) has been removed; measured on the 48-image restaurant benchmark
it scored identically to GrabCut on dietary accuracy (95.83% either way).

Public interface:  crop(image) -> (PIL.Image, method)
"""

import os

from PIL import Image

DEFAULT_BACKEND = os.environ.get('DISHDETECT_CROP_BACKEND', 'grabcut')


def crop(image, padding=0.08, min_area_frac=0.06, backend=None):
    """
    Crop to the food region.

    `image` is a path or a PIL.Image. Returns (PIL.Image, method) where
    method is the backend name on success, or 'center_crop' on fallback.

    `min_area_frac` rejects crops smaller than this fraction of the frame.
    Without it a small bright region beside the plate can win on area and
    the classifier receives a tiny crop upscaled to 344px, which reads as
    blur rather than food.
    """
    from .crop_backends import find_box

    backend = backend or DEFAULT_BACKEND
    img = Image.open(image).convert('RGB') if isinstance(image, str) else image.convert('RGB')
    W, H = img.size

    box = find_box(img, backend)
    if box is not None:
        area = (box[2] - box[0]) * (box[3] - box[1])
        if area >= float(W * H) * min_area_frac:
            return _apply(img, box, padding), backend

    return _center(img), 'center_crop'


def _apply(img, box, padding):
    W, H = img.size
    x1, y1, x2, y2 = box
    pad_x, pad_y = (x2 - x1) * padding, (y2 - y1) * padding
    return img.crop((
        max(0.0, x1 - pad_x), max(0.0, y1 - pad_y),
        min(float(W), x2 + pad_x), min(float(H), y2 + pad_y),
    ))


def _center(img):
    W, H = img.size
    mx, my = int(W * 0.10), int(H * 0.10)
    return img.crop((mx, my, W - mx, H - my))
