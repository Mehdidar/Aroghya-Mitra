"""
taxonomy.py
-----------
Dish knowledge lookup. Turns a dish name into its diet tier, ingredients,
animal byproduct and rationale.

core/indian_taxonomy.json is the single authority on dietary labels: the
training sets are derived from it (tools/build_diet_datasets.py) and the
predictor reads it at inference.

Convention: egg dishes are 'non_veg', following Indian (FSSAI) labelling.
'vegetarian' therefore means lacto-vegetarian, and 'vegan' additionally
rules out ghee, butter, curd, paneer and milk.
"""

import json
from functools import lru_cache

from .config import TAXONOMY_PATH

TIERS = ('non_veg', 'vegetarian', 'vegan')


@lru_cache(maxsize=1)
def load() -> dict:
    with open(TAXONOMY_PATH) as f:
        return json.load(f)


def known_dishes() -> list:
    return sorted(load().keys())


def tier(dish: str):
    """
    Collapse the taxonomy into the 3-tier dietary label.

    legacy_diet is the veg/non-veg axis; new_diet splits meat-free dishes
    into vegan vs non_vegan (= lacto vegetarian).
    Returns None for an unknown dish rather than guessing.
    """
    entry = load().get(dish)
    if entry is None:
        return None
    if entry.get('legacy_diet') == 'non_veg':
        return 'non_veg'
    return 'vegan' if entry.get('new_diet') == 'vegan' else 'vegetarian'


def info(dish: str) -> dict:
    """Full record for a dish, with the derived tier folded in."""
    entry = load().get(dish)
    if entry is None:
        return {
            'dish': dish,
            'known': False,
            'tier': None,
            'local_name': None,
            'region': None,
            'key_ingredients': None,
            'animal_byproduct': None,
            'rationale': None,
        }
    return {
        'dish': dish,
        'known': True,
        'tier': tier(dish),
        # The dish name in Devanagari; written by hand per dish.
        'local_name': entry.get('local_name'),
        'region': entry.get('region'),
        'key_ingredients': entry.get('key_ingredients'),
        'animal_byproduct': entry.get('animal_byproduct'),
        'rationale': entry.get('rationale'),
    }


def tier_counts() -> dict:
    out = {t: 0 for t in TIERS}
    for d in load():
        t = tier(d)
        if t:
            out[t] += 1
    return out
