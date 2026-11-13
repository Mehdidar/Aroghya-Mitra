"""
food.py
-------
The app-facing shape of a prediction: POST /ai/food.

The mobile app (mobile/features/shared/services/food) speaks the
FoodRecognition schema the patient-AI server defined, so DishDetect can sit
behind it directly or through that server. This module is the mapping from
DietPredictor's verdict to that schema, kept pure so it can be tested
without loading a model.

Beyond the base schema (isFood, items[], notes, source, reliable) each item
carries what the app's nutrition screen needs to say more than four macros:

    per100g        kcal, proteinG, carbsG, fatG, plus fiberG, sugarsG,
                   sodiumMg when the curated table has them
    estimatedGrams a typical single portion from the curated table, with
                   its household measure in portionDescription
    diet           tier, allergens, who it suits, condition cautions
    nutrition      provenance and source of the numbers, never implied

`reliable` is false unless the dish was recognised, the dietary verdict
cleared its own floor AND the numbers have a provenance. A name with no
nutrition is shown, but not vouched for.
"""

DEFAULT_PORTION_GRAMS = 200

_MACROS = (('kcal', 'kcal'), ('protein_g', 'proteinG'), ('carbs_g', 'carbsG'),
           ('fat_g', 'fatG'))
_EXTRA = (('fiber_g', 'fiberG'), ('sugars_g', 'sugarsG'), ('sodium_mg', 'sodiumMg'))


def display_name(key):
    return key.replace('_', ' ').strip().capitalize() if key else key


def _per100g(nutrients):
    out = {app: float(nutrients.get(raw) or 0) for raw, app in _MACROS}
    for raw, app in _EXTRA:
        if nutrients.get(raw) is not None:
            out[app] = float(nutrients[raw])
    return out


def to_food_recognition(result, request_id=None):
    """DietPredictor.predict() output -> FoodRecognition (+ requestId)."""
    dish = result.get('dish') or {}
    diet = result.get('diet') or {}
    nut = result.get('nutrition') or {}
    rules = result.get('restrictions') or {}
    warnings = list(result.get('warnings') or [])
    recognized = bool(dish.get('recognized') and dish.get('name'))

    notes = result.get('rationale')
    if warnings:
        notes = ' '.join(([notes] if notes else []) + warnings)

    base = {'isFood': True, 'source': 'dishdetect', 'notes': notes or None,
            'requestId': request_id, 'warnings': warnings,
            'servedBy': result.get('served_by')}

    if not recognized:
        return {**base, 'items': [], 'reliable': False}

    has_numbers = nut.get('provenance') in ('verified', 'estimated') and nut.get('nutrients')
    nutrients = nut.get('nutrients') or {}
    item = {
        'name': display_name(dish['name']),
        'localName': dish.get('local_name'),
        'isIndianDish': True,
        'portionDescription': nut.get('portion'),
        'estimatedGrams': nut.get('portion_g') or DEFAULT_PORTION_GRAMS,
        'per100g': _per100g(nutrients if has_numbers else {}),
        'confidence': float(dish.get('confidence') or 0),
        'diet': {
            'tier': rules.get('tier') or diet.get('tier'),
            'label': diet.get('label'),
            'reliable': bool(diet.get('reliable')),
            'allergens': list(rules.get('allergens') or []),
            'containsOnionGarlic': rules.get('contains_onion_garlic'),
            'suitable': dict(rules.get('suitable') or {}),
            'cautions': [{'code': c['code'], 'level': c['level']}
                         for c in rules.get('cautions') or []],
            'animalByproduct': rules.get('animal_byproduct'),
        },
        'nutrition': {
            'provenance': nut.get('provenance', 'none'),
            'source': nut.get('source'),
            'note': nut.get('note') or nut.get('reason'),
        },
    }
    reliable = bool(diet.get('reliable')) and bool(has_numbers)
    return {**base, 'items': [item], 'reliable': reliable}
