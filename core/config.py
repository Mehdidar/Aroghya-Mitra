"""
config.py
---------
Single source of truth for model paths, input resolutions and thresholds.

This project is the Indian-food sibling of the Saudi DishDetect project. The
pipeline is identical -- three heads, taxonomy lookup, cross-check, open-set
guard -- but every head has to be (re)trained on Indian photographs.

Two kinds of checkpoint live here:

  HEADS      the Indian heads this project trains. They do not exist until
             scripts/train.py has been run.
  BASELINES  the three checkpoints trained in the Saudi project, copied in
             unchanged. They are the warm-start for training
             (scripts/train.py --init ...), and the veg and vegan ones also
             serve as a stand-in until the Indian heads exist.

A stand-in is not a result. The Saudi veg head scored 91.7% in domain and
65.9% on 2,191 German dish photos; nobody has measured it on Indian food.
The predictor marks every answer served by a baseline as unreliable.
"""

import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

TAXONOMY_PATH = os.path.join(ROOT, 'core', 'indian_taxonomy.json')


def _p(*parts):
    return os.path.join(ROOT, *parts)


# The Indian heads. img_size is inherited from the Saudi sweep as a starting
# point; it is the resolution each head is trained AND served at, so change
# it here and retrain rather than at inference.
# The class list is read from results_dir/class_mapping.json, which
# scripts/train.py writes -- there is no num_classes to keep in sync.
HEADS = {
    'dish': {
        'checkpoint':  _p('checkpoints', 'dish_indian_best.pth'),
        'architecture': 'mobilenet_v3_large',
        'img_size': 320,
        'results_dir': _p('results', 'runs', 'dish_indian'),
    },
    'veg': {
        'checkpoint':  _p('checkpoints', 'veg_indian_best.pth'),
        'architecture': 'mobilenet_v3_large',
        'img_size': 344,
        'results_dir': _p('results', 'runs', 'veg_indian'),
    },
    'vegan': {
        'checkpoint':  _p('checkpoints', 'vegan_indian_best.pth'),
        'architecture': 'mobilenet_v3_large',
        'img_size': 288,
        'results_dir': _p('results', 'runs', 'vegan_indian'),
    },
}

# The Saudi checkpoints. 'veg' and 'vegan' have the same two classes in the
# same order as the Indian heads, so they can stand in at inference. 'dish'
# names 26 Saudi dishes and is useless for naming Indian food -- it is here
# only so its backbone can warm-start the Indian dish head.
_BASE = _p('checkpoints', 'pretrained_saudi')
BASELINES = {
    'dish': {
        'checkpoint':  os.path.join(_BASE, 'dish_grabcut_best.pth'),
        'architecture': 'mobilenet_v3_large',
        'img_size': 320,
        'results_dir': os.path.join(_BASE, 'dish_grabcut'),
    },
    'veg': {
        'checkpoint':  os.path.join(_BASE, 'veg_grabcut_best.pth'),
        'architecture': 'mobilenet_v3_large',
        'img_size': 344,
        'results_dir': os.path.join(_BASE, 'veg_grabcut'),
    },
    'vegan': {
        'checkpoint':  os.path.join(_BASE, 'vegan_grabcut_best.pth'),
        'architecture': 'mobilenet_v3_large',
        'img_size': 288,
        'results_dir': os.path.join(_BASE, 'vegan_grabcut'),
    },
}
# Heads a baseline may serve at inference when the Indian head is missing.
BASELINE_SERVABLE = ('veg', 'vegan')


def head_is_trained(name):
    spec = HEADS[name]
    return (os.path.exists(spec['checkpoint'])
            and os.path.exists(os.path.join(spec['results_dir'], 'class_mapping.json')))


# Heads served by a CLIP linear probe instead of the fine-tuned MobileNetV3
# checkpoint (tools/clip_probe.py --save). In the Saudi project a logistic
# regression on frozen OpenCLIP features beat fine-tuning on the dish head
# (87.96% vs 75.93%) and the veg head (96.80% vs 91.32%) and lost narrowly on
# the vegan head. Whether that holds for Indian food is to be measured: a
# probe is only served once its file exists, so nothing here is assumed.
CLIP_PROBE_HEADS = {
    'dish': _p('checkpoints', 'clip_probe_dish.joblib'),
    'veg':  _p('checkpoints', 'clip_probe_veg.joblib'),
}

# ---------------------------------------------------------------------------
# Thresholds. EVERY value below was swept on the Saudi checkpoints and is
# carried over only as a starting point. A threshold is a property of a
# specific checkpoint, not of the problem: re-sweep each one after training
# the Indian heads (tools/vegan_threshold_sweep.py, tools/eval_openset.py).
# ---------------------------------------------------------------------------

# Naming a dish and claiming it is vegan are different bets. A wrong name is
# a wrong label; "vegan" on a dish cooked in ghee is the failure this system
# exists to prevent, and a photograph cannot show ghee, butter, curd or
# cream -- only the dish identity carries that. Indian cooking makes this
# harder than the Saudi case, not easier: ghee is invisible and common.
VEGAN_DISH_CONFIDENCE = 0.75

DISH_CONFIDENCE_FLOOR = 0.45
DIET_CONFIDENCE_FLOOR = 0.60

# The vegan head must clear this, not merely win on argmax.
VEGAN_THRESHOLD = 0.55

# Open-set guard: mean cosine similarity to the K nearest training images
# (frozen OpenCLIP ViT-B-32). Below the threshold the photo is treated as a
# dish the model has never seen and the whole result is marked unreliable.
# Inactive until tools/build_openset_index.py has built the index.
OPENSET_THRESHOLD = 0.70
OPENSET_K = 5

VALID_EXTS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
