"""
predictor.py
------------
One photo in, everything out: dish name, dietary tier, ingredients, the
reason for the verdict, and an honest confidence.

Design notes
------------
Three heads run on the same crop:

  dish   (N-class)   -> dish name, and via core.taxonomy the ingredients,
                        animal byproduct and written rationale
  veg    (binary)    -> veg / non_veg
  vegan  (binary)    -> vegan / vegetarian, only if veg

The dietary verdict comes from the BINARY heads, not from the dish lookup.
In the Saudi project this design came from, the binary veg head beat the
dish-lookup route (92.70% against 86.64%), and the lookup served as an
independent CHECK on it. When the two disagree, that is surfaced rather
than hidden. Whether the same ordering holds on Indian food is unmeasured.

Until the Indian heads are trained (scripts/train.py), the veg and vegan
heads are served by the Saudi checkpoints in checkpoints/pretrained_saudi
and there is no dish head at all. In that state every result is marked
unreliable and "vegan" is never claimed -- see DietPredictor.__init__.

Confidence is composed, not conditional. The previous
scripts/predict_hierarchical.py reported P(vegan | veg) as the final
confidence; a 0.55 stage-1 call followed by a 0.95 stage-2 call displayed
as 95% confident. Here the vegan/vegetarian tiers report
P(veg) * P(tier | veg).

Each head runs at its own measured-best resolution (see core/config.py).
"""

import os
import json

import torch
import torch.nn.functional as F
from PIL import Image, ImageOps

from .config import (
    HEADS, BASELINES, BASELINE_SERVABLE, head_is_trained, CLIP_PROBE_HEADS, DISH_CONFIDENCE_FLOOR, DIET_CONFIDENCE_FLOOR,
    VEGAN_DISH_CONFIDENCE, VEGAN_THRESHOLD, OPENSET_THRESHOLD, OPENSET_K,
)
from .models import FoodClassifier
from .transforms import get_transforms
from . import taxonomy
from . import nutrition as _nutrition
from . import diet as _diet


def _pick_device(explicit=None):
    if explicit is not None:
        return torch.device(explicit)
    if torch.backends.mps.is_available():
        return torch.device('mps')
    if torch.cuda.is_available():
        return torch.device('cuda')
    return torch.device('cpu')


class _Head:
    """One classifier plus its class mapping and its own input transform."""

    def __init__(self, name, spec, device):
        self.name = name
        self.img_size = spec['img_size']
        with open(os.path.join(spec['results_dir'], 'class_mapping.json')) as f:
            mapping = json.load(f)
        self.classes = [mapping[str(i)] for i in range(len(mapping))]
        self.model = FoodClassifier(
            num_classes=len(self.classes),
            freeze_backbone=False,
            architecture=spec['architecture'],
            pretrained=False,      # the checkpoint below replaces every weight
        )
        state = torch.load(spec['checkpoint'], map_location='cpu')
        self.model.load_state_dict(state)
        self.model.to(device).eval()
        self.device = device
        _, self.transform = get_transforms(self.img_size)

    @torch.no_grad()
    def probs(self, pil_img):
        x = self.transform(pil_img).unsqueeze(0).to(self.device)
        return F.softmax(self.model(x), dim=1)[0].cpu()

    def probs_over_views(self, views, feats=None):
        """Mean of the per-view softmax outputs."""
        return torch.stack([self.probs(v) for v in views]).mean(0)

    def top1(self, pil_img):
        p = self.probs(pil_img)
        idx = int(p.argmax())
        return self.classes[idx], float(p[idx]), p


class _ProbeHead:
    """A logistic regression over frozen OpenCLIP features.

    Same interface as _Head, but it combines views differently and the
    difference is not cosmetic: the probe was fitted on the MEAN of the
    per-view CLIP feature vectors, renormalised, then classified once.
    Averaging per-view probabilities instead is a different estimator and
    would not reproduce the accuracy this head was accepted on.

    It carries no backbone of its own — the CLIP encoder is already loaded
    for the open-set gate, and the features arrive precomputed.
    """

    def __init__(self, name, path):
        import joblib
        blob = joblib.load(path)
        self.name = name
        self.clf = blob['clf']
        self.classes = list(blob['classes'])
        self.views = blob.get('views')
        self.test_accuracy = blob.get('test_accuracy')

    def probs_over_views(self, views, feats=None):
        if feats is None or len(feats) == 0:
            raise ValueError(f'{self.name}: probe head needs CLIP features')
        import numpy as np
        m = feats.mean(axis=0, keepdims=True)
        m = m / np.linalg.norm(m, axis=1, keepdims=True)
        p = self.clf.predict_proba(m)[0]
        return torch.tensor(p, dtype=torch.float32)


class DietPredictor:
    def __init__(self, use_crop='ensemble', device=None, heads=('dish', 'veg', 'vegan'),
                 crop_backend=None, openset=True, nutrition=True):
        """
        use_crop:
            True       crop to the food region, classify the crop
            False      classify the whole frame
            'ensemble' classify both and average the probabilities

        'ensemble' exists because neither view dominates. Measured on the
        48-image restaurant set: crop 93.75%, no-crop 91.67%. The two fail
        on different images — an aggressive crop can zoom past the context
        that separates grilled meat from baked dough, while the full frame
        dilutes a small dish with background. Averaging recovers both.
        """
        from .crop import DEFAULT_BACKEND
        self.device = _pick_device(device)
        self.use_crop = use_crop
        self.crop_backend = crop_backend or DEFAULT_BACKEND
        self.nutrition = nutrition
        # A probe head needs the CLIP encoder, which the open-set gate also
        # loads. If its file is missing the fine-tuned checkpoint still
        # serves, so a fresh clone works before anyone runs clip_probe.py.
        self.heads, self.served_by = {}, {}
        for n in heads:
            path = CLIP_PROBE_HEADS.get(n)
            if path and os.path.exists(path):
                try:
                    self.heads[n] = _ProbeHead(n, path)
                    self.served_by[n] = 'clip_probe'
                    continue
                except Exception:
                    pass
            if head_is_trained(n):
                self.heads[n] = _Head(n, HEADS[n], self.device)
                self.served_by[n] = 'mobilenet_v3'
            elif n in BASELINE_SERVABLE and os.path.exists(BASELINES[n]['checkpoint']):
                # Not trained on Indian food yet: the Saudi checkpoint stands
                # in. Same two classes, same order, unmeasured accuracy.
                self.heads[n] = _Head(n, BASELINES[n], self.device)
                self.served_by[n] = 'saudi_baseline'
            else:
                # The dish head has no stand-in: 26 Saudi dish names are not
                # an approximation of Indian ones.
                self.served_by[n] = 'untrained'
        for n in ('veg', 'vegan'):
            if n in heads and n not in self.heads:
                raise RuntimeError(
                    f"No '{n}' model available: neither {HEADS[n]['checkpoint']} "
                    f"nor the baseline {BASELINES[n]['checkpoint']} exists.")
        self.baseline_heads = sorted(n for n, v in self.served_by.items()
                                     if v == 'saudi_baseline')
        self.needs_clip = any(v == 'clip_probe' for v in self.served_by.values())

        # Open-set guard. Optional: without the index the predictor still
        # works, it just falls back to the softmax floor alone.
        self.openset = None
        if openset:
            try:
                from .openset import OpenSetDetector
                self.openset = OpenSetDetector(k=OPENSET_K,
                                               threshold=OPENSET_THRESHOLD)
            except Exception:
                self.openset = None

    def _views(self, img):
        """Return [(image, weight)] to average over, plus the crop method used."""
        if self.use_crop is False:
            return [img], 'none'
        from .crop import crop as crop_fn
        cropped, method = crop_fn(img, backend=self.crop_backend)
        if self.use_crop == 'ensemble':
            return [cropped, img], f'ensemble:{method}'
        return [cropped], method

    def _clip_feats(self, views):
        """Encode every view once; the gate and the probe heads share them."""
        from . import openset as _os
        return _os.encode(list(views))

    # ---------------------------------------------------------------- public

    def predict(self, image) -> dict:
        img = Image.open(image) if isinstance(image, str) else image
        # Phones record orientation in EXIF rather than rotating the pixels,
        # and PIL does not apply it on open. Every photograph this project
        # trained and measured on had the tag stripped, so nothing in the
        # evaluation suite could surface it -- while a photograph taken
        # through the camera UI arrives on its side. Measured on 12 restaurant
        # photos re-tagged the way a phone sends them, 1 flipped from non_veg
        # to vegan: a lamb mandi reported as plant-based, which is the exact
        # failure this system is built to avoid.
        img = ImageOps.exif_transpose(img).convert('RGB')

        views, crop_method = self._views(img)

        # One CLIP pass over the views, reused by the open-set gate and by
        # every probe head, rather than one encode each.
        feats = self._clip_feats(views) if (self.needs_clip or self.openset) else None
        probs = lambda name: self.heads[name].probs_over_views(views, feats)

        warnings = []

        # ---- dish identity (and everything the taxonomy hangs off it) ----
        has_dish_head = 'dish' in self.heads
        if has_dish_head:
            dish_p = probs('dish')
            _di = int(dish_p.argmax())
            dish_name, dish_conf = self.heads['dish'].classes[_di], float(dish_p[_di])
        else:
            dish_p, dish_name, dish_conf = [], None, 0.0
        # The runners-up, for a user to correct the top-1 from. They cost
        # nothing -- the distribution was already computed -- and a wrong
        # name the user can fix is worth more than a wrong name they cannot.
        _order = sorted(range(len(dish_p)), key=lambda i: -float(dish_p[i]))[:4]
        alternatives = [{'dish': self.heads['dish'].classes[i],
                         'confidence': round(float(dish_p[i]), 4),
                         'tier': taxonomy.tier(self.heads['dish'].classes[i]),
                         'local_name': taxonomy.info(self.heads['dish'].classes[i])['local_name'],
                         'region': taxonomy.info(self.heads['dish'].classes[i])['region']}
                        for i in _order]
        # Two independent gates. The softmax floor catches a hesitant call
        # among the known dishes; the CLIP guard catches a dish that is
        # not among them at all, which softmax alone detects poorly
        # (AUROC 0.886 against 0.979 — see core/config.py).
        openset_info = None
        in_distribution = True
        if self.openset is not None:
            # views[-1] is the full frame whenever it is in play; the gate was
            # measured on the full frame, so only reuse it when that holds.
            if feats is not None and views and views[-1] is img:
                openset_info = self.openset.check_vector(feats[-1])
            else:
                openset_info = self.openset.check(img)
            in_distribution = openset_info['in_distribution']

        dish_known = (has_dish_head and dish_conf >= DISH_CONFIDENCE_FLOOR
                      and in_distribution)

        if not has_dish_head:
            warnings.append(
                'No Indian dish model has been trained yet, so the dish is not '
                'named and no ingredients are shown. Train one with '
                'scripts/train.py (see README).')
        if self.baseline_heads:
            warnings.append(
                'The dietary verdict comes from models trained on Saudi dishes '
                f'({", ".join(self.baseline_heads)}), not yet retrained on '
                'Indian food. Their accuracy on Indian food has not been '
                'measured -- treat this as a demonstration, not a result.')

        if openset_info is not None and not in_distribution:
            warnings.append(
                f'This does not resemble anything in the training set '
                f'(similarity {openset_info["score"]:.2f}, floor '
                f'{openset_info["threshold"]:.2f}). Treat the whole result as '
                f'unreliable, not just the dish name: the veg/non-veg head '
                f'does not generalise to food unlike its training set.'
            )
        elif has_dish_head and not dish_known:
            # In-distribution but the dish head hesitated. The dietary verdict
            # still stands -- unlike the out-of-distribution case above.
            warnings.append(
                f'Dish not confidently recognised ({dish_conf:.0%}) among the '
                f'{len(self.heads["dish"].classes)} dishes this model knows, so no '
                f'name or ingredients are shown. The dietary verdict comes from '
                f'the veg/non-veg model and does not depend on the dish name.'
            )
        meta = taxonomy.info(dish_name) if dish_known else taxonomy.info('__unknown__')

        # ---- dietary verdict from the binary heads ----
        veg_classes = self.heads['veg'].classes          # ['non_veg', 'veg']
        veg_probs = probs('veg')
        p_veg = float(veg_probs[veg_classes.index('veg')])
        p_non_veg = float(veg_probs[veg_classes.index('non_veg')])
        is_veg = p_veg > p_non_veg

        if is_veg:
            vg_classes = self.heads['vegan'].classes     # ['vegan', 'vegetarian']
            vg_probs = probs('vegan')
            p_vegan_given_veg = float(vg_probs[vg_classes.index('vegan')])
            p_vegetarian_given_veg = float(vg_probs[vg_classes.index('vegetarian')])
            # Asymmetric decision, not argmax: "vegan" is the claim that can
            # harm someone if wrong, so it has to clear VEGAN_THRESHOLD.
            #
            # And clearing it is not sufficient. "Vegan" asserts the absence
            # of dairy, egg and ghee -- none of which a photograph shows. The
            # veg head is a meat detector; the vegan head has only ever seen
            # the dishes in the taxonomy. When the dish is not recognised,
            # nothing in the chain has established that there is no dairy,
            # and the model will happily guess: in the Saudi project, of 60
            # photographs of cheese pies outside the taxonomy, 24 came back
            # "vegan" and 4 of those were marked reliable. For Indian food
            # the same trap is ghee, butter and curd.
            #
            # So the vegan claim is gated on the taxonomy confirming it for a
            # recognised dish. Meat-free but unidentified is reported as
            # 'meat_free', which is the strongest honest answer available:
            # useful to a vegetarian, and a clear "check first" to a vegan.
            if p_vegan_given_veg > VEGAN_THRESHOLD:
                cond = p_vegan_given_veg
                # The dish must be recognised, the taxonomy must call it
                # vegan, AND the identification must be confident enough to
                # bet someone's diet on -- see VEGAN_DISH_CONFIDENCE.
                confident_id = dish_known and dish_conf >= VEGAN_DISH_CONFIDENCE
                tier = ('vegan' if (confident_id and meta['tier'] == 'vegan')
                        else 'meat_free')
            else:
                tier, cond = 'vegetarian', p_vegetarian_given_veg
            # composed, not conditional
            diet_conf = p_veg * cond
        else:
            tier, diet_conf = 'non_veg', p_non_veg
            p_vegan_given_veg = p_vegetarian_given_veg = None

        if diet_conf < DIET_CONFIDENCE_FLOOR:
            warnings.append(
                f'Dietary confidence {diet_conf:.0%} is below the '
                f'{DIET_CONFIDENCE_FLOOR:.0%} floor — treat this as uncertain.'
            )

        # ---- independent cross-check: does the dish lookup agree? ----
        lookup_tier = meta['tier'] if dish_known else None
        if lookup_tier is None:
            agreement = None
        else:
            # 'meat_free' is a vegan claim withheld for want of a dish
            # identity, not a contradiction of the lookup.
            agreement = (lookup_tier == tier
                         or (tier == 'meat_free' and lookup_tier in ('vegan', 'vegetarian')))
            if not agreement:
                warnings.append(
                    f'Disagreement: the image classifier says "{tier}" but dish '
                    f'"{dish_name}" is recorded as "{lookup_tier}" in the taxonomy. '
                    f'One of the two is wrong — do not rely on this result.'
                )

        # Out of distribution the dietary verdict is NOT salvageable. The
        # binary heads were assumed to generalise; they do not. The Saudi
        # veg head scored 65.9% on 2,191 German dish photos against 91.7%
        # in domain. So an out-of-distribution photo makes the whole result
        # unreliable, not merely unnamed.
        reliable = (
            diet_conf >= DIET_CONFIDENCE_FLOOR
            and agreement is not False
            and in_distribution
            # A stand-in model's answer has never been measured on this cuisine.
            and not self.baseline_heads
        )

        nutrition_result = (_nutrition.for_dish(dish_name if dish_known else None,
                                                meta['key_ingredients'])
                            if self.nutrition else None)

        return {
            'dish': {
                'name': dish_name if dish_known else None,
                'raw_prediction': dish_name,
                'local_name': meta['local_name'],
                'region': meta['region'],
                'confidence': round(dish_conf, 4),
                'recognized': dish_known,
            },
            'diet': {
                'tier': tier,
                'label': self._label(tier),
                'confidence': round(diet_conf, 4),
                'source': 'binary_heads',
                'reliable': reliable,
            },
            'lookup': {
                'tier': lookup_tier,
                'agreement': agreement,
            },
            'nutrition': nutrition_result,
            # Allergens, who the dish suits and condition cautions, judged on
            # the same nutrients shown above (core/diet.py).
            'restrictions': _diet.restrictions(dish_name if dish_known else None,
                                               nutrition_result),
            'alternatives': alternatives,
            'ingredients': meta['key_ingredients'],
            'animal_byproduct': meta['animal_byproduct'],
            # For 'meat_free' the taxonomy's own rationale would read
            # "100% plant-based" directly beneath a verdict that declines to
            # say so -- the dish record is for the dish we are not certain
            # this is. The withheld-claim explanation takes precedence.
            'rationale': (self._meat_free_rationale(dish_known, dish_name)
                          if tier == 'meat_free'
                          else meta['rationale'] or self._fallback_rationale(tier)),
            'probabilities': {
                'veg': round(p_veg, 4),
                'non_veg': round(p_non_veg, 4),
                'vegan_given_veg': round(p_vegan_given_veg, 4) if p_vegan_given_veg is not None else None,
                'vegetarian_given_veg': round(p_vegetarian_given_veg, 4) if p_vegetarian_given_veg is not None else None,
            },
            'openset': openset_info,
            'served_by': dict(self.served_by),
            'crop_method': crop_method,
            'warnings': warnings,
        }

    # --------------------------------------------------------------- helpers

    @staticmethod
    def _label(tier):
        return {
            'non_veg': 'Non-Vegetarian',
            'vegetarian': 'Vegetarian (contains dairy or egg)',
            'vegan': 'Vegan (fully plant-based)',
            'meat_free': 'No meat detected — dairy and egg unconfirmed',
        }[tier]

    @staticmethod
    def _meat_free_rationale(dish_known, dish_name):
        """Why the vegan claim was withheld -- the two cases read differently
        to a user, and saying 'not recognised' about a dish shown by name on
        the same screen reads as a bug."""
        if dish_known:
            return (f'This looks like {dish_name}, which is plant-based, but the '
                    f'identification is not certain enough to promise that. Dairy, '
                    f'egg and ghee do not show up in a photograph, so they can only '
                    f'be ruled out once the dish is known. Ask the restaurant.')
        return ('No meat, poultry or fish is visible, but this dish was not '
                'recognised. Dairy, egg and ghee cannot be ruled out from a '
                'photograph alone. Ask the restaurant.')

    @staticmethod
    def _fallback_rationale(tier):
        return {
            'non_veg': 'Visual evidence of meat, poultry, fish or seafood.',
            'vegetarian': 'Appears meat-free but shows dairy or egg content.',
            'vegan': 'Appears to contain no animal products.',
            'meat_free': ('No meat, poultry or fish is visible, but this dish '
                          'was not recognised, so dairy, egg and ghee cannot be '
                          'ruled out from a photograph. Ask before relying on it.'),
        }[tier]
