"""
nutrition.py
------------
Nutrition lookup for a recognised dish, retrieved from USDA FoodData Central.

Retrieval, not generation. The query is built from the dish name plus the
`key_ingredients` recorded in core/indian_taxonomy.json; candidates are ranked
against 7,793 SR Legacy foods with TF-IDF over character n-grams, which
handles the spelling drift between "za'atar_manakish" and "Bread, pita".

Provenance is the point. Three states, never blurred:

    verified   hand-checked mapping to an FDC entry that IS this food —
               hummus to "Hummus, commercial", kofta to "Lamb, ground,
               cooked, broiled". The numbers are USDA's and the mapping
               has been eyeballed.
    estimated  a hand-checked approximation (usually the dish's dominant
               component, e.g. mandi to cooked rice with the lamb not
               counted) or an automatic retrieval hit. Always carries a
               note saying what it leaves out.
    none       no reasonable analogue in SR Legacy. No numbers at all,
               rather than a confident wrong figure.

SR Legacy is a corpus of generic American foods and contains few Indian
composite dishes. Automatic retrieval over it is unreliable -- in the Saudi
project, searching "shawarma" returned "Marmalade, orange" -- which is why
dishes should be mapped by hand in core/nutrition_map.json. That map is
EMPTY for the Indian taxonomy so far, so every nutrition figure this project
currently shows is an automatic retrieval hit labelled 'estimated'.

USDA FoodData Central is a work of the US federal government and is in the
public domain.
"""

import os
import json
from functools import lru_cache

from .config import ROOT

DATA = os.path.join(ROOT, 'datasets', 'usda', 'nutrition.json')
MAP = os.path.join(ROOT, 'core', 'nutrition_map.json')

# Below this the top match is not worth showing at all.
MATCH_FLOOR = 0.18

FIELDS = ('kcal', 'protein_g', 'fat_g', 'carbs_g',
          'fiber_g', 'sugars_g', 'sodium_mg', 'calcium_mg', 'iron_mg')


@lru_cache(maxsize=1)
def _foods():
    """The food table and an id index. Cheap — no vectoriser is built."""
    with open(DATA) as f:
        foods = json.load(f)['foods']
    return foods, {f['fdc_id']: f for f in foods}


@lru_cache(maxsize=1)
def _corpus():
    """TF-IDF index, built lazily. Only the retrieval fallback needs it;
    a hand-mapped dish resolves by id without paying for this."""
    foods, _ = _foods()
    from sklearn.feature_extraction.text import TfidfVectorizer
    vec = TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 5),
                          sublinear_tf=True, min_df=2)
    matrix = vec.fit_transform([f['description'] for f in foods])
    return foods, vec, matrix


@lru_cache(maxsize=1)
def _hand_map():
    if not os.path.exists(MAP):
        return {}
    with open(MAP) as f:
        return json.load(f)


def _nutrients(food):
    return {k: food[k] for k in FIELDS if k in food}


def search(query, k=5):
    """Top-k FDC candidates for a free-text query, with similarity scores."""
    foods, vec, matrix = _corpus()
    import numpy as np
    sims = (vec.transform([query]) @ matrix.T).toarray()[0]
    idx = np.argsort(-sims)[:k]
    return [{'fdc_id': foods[i]['fdc_id'],
             'description': foods[i]['description'],
             'category': foods[i].get('category', ''),
             'similarity': round(float(sims[i]), 4),
             'nutrients': _nutrients(foods[i])}
            for i in idx if sims[i] > 0]


def _by_id(fdc_id):
    return _foods()[1].get(str(fdc_id))


def for_dish(dish, ingredients=None, k=5):
    """
    Nutrition for a dish name. Returns a dict whose `provenance` field is
    always one of 'verified', 'estimated' or 'none' — never implied.
    """
    if not dish:
        return {'provenance': 'none', 'reason': 'no dish identified',
                'per': '100 g', 'source': 'USDA FoodData Central (SR Legacy)'}

    hand = _hand_map().get(dish)
    if hand is not None:
        # An explicit null mapping means "checked, no analogue exists".
        if not hand.get('fdc_id'):
            return {'provenance': 'none',
                    'reason': hand.get('note', 'no USDA analogue for this dish'),
                    'per': '100 g', 'source': 'USDA FoodData Central (SR Legacy)'}
        food = _by_id(hand['fdc_id'])
        if food:
            return {
                'provenance': hand.get('provenance', 'estimated'),
                'matched': food['description'],
                'fdc_id': food['fdc_id'],
                'note': hand.get('note'),
                'hand_checked': True,
                'nutrients': _nutrients(food),
                'per': '100 g',
                'source': 'USDA FoodData Central (SR Legacy)',
            }

    query = dish.replace('_', ' ')
    if ingredients:
        query = f'{query} {ingredients}'
    hits = search(query, k=k)
    if not hits or hits[0]['similarity'] < MATCH_FLOOR:
        return {'provenance': 'none',
                'reason': f'no USDA entry matched "{dish}" above the floor',
                'candidates': hits[:3],
                'per': '100 g', 'source': 'USDA FoodData Central (SR Legacy)'}

    top = hits[0]
    return {
        'provenance': 'estimated',
        'matched': top['description'],
        'fdc_id': top['fdc_id'],
        'similarity': top['similarity'],
        'note': 'Automatically retrieved, not hand-checked. SR Legacy holds few '
                'Indian dishes, so treat this as a rough indication only.',
        'hand_checked': False,
        'nutrients': top['nutrients'],
        'alternatives': [{'description': h['description'], 'fdc_id': h['fdc_id'],
                          'similarity': h['similarity']} for h in hits[1:4]],
        'per': '100 g',
        'source': 'USDA FoodData Central (SR Legacy)',
    }
