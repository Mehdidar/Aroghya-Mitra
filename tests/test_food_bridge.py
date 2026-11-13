"""/ai/food is a pure reshaping of the predictor's verdict. It must never
promote a result: a name without numbers is shown but not vouched for."""

from api.food import DEFAULT_PORTION_GRAMS, display_name, to_food_recognition
from core import diet, nutrition


def verdict(dish='gulab_jamun', recognized=True, reliable=True, with_nutrition=True):
    nut = nutrition.for_dish(dish) if with_nutrition else {'provenance': 'none', 'reason': 'x'}
    return {
        'dish': {'name': dish if recognized else None, 'raw_prediction': dish,
                 'local_name': 'गुलाब जामुन', 'confidence': 0.81, 'recognized': recognized},
        'diet': {'tier': 'vegetarian', 'label': 'Vegetarian', 'reliable': reliable},
        'nutrition': nut,
        'restrictions': diet.restrictions(dish if recognized else None, nut),
        'rationale': 'Khoya dumplings in syrup.',
        'warnings': [],
        'served_by': {'dish': 'clip_probe'},
    }


def test_recognised_dish_carries_portion_macros_and_diet():
    r = to_food_recognition(verdict(), request_id='req1')
    assert r['source'] == 'dishdetect' and r['requestId'] == 'req1' and r['isFood']
    assert r['reliable'] is True
    [item] = r['items']
    assert item['name'] == 'Gulab jamun' and item['localName'] == 'गुलाब जामुन'
    assert item['portionDescription'] == '2 pieces' and item['estimatedGrams'] == 80
    m = item['per100g']
    assert m['kcal'] == 330 and m['proteinG'] == 5 and m['carbsG'] == 50 and m['fatG'] == 13
    assert m['sugarsG'] == 38 and m['sodiumMg'] == 60 and m['fiberG'] == 0.5
    assert item['diet']['tier'] == 'vegetarian'
    assert 'dairy' in item['diet']['allergens']
    assert {'code': 'diabetes', 'level': 'high'} in item['diet']['cautions']
    assert item['diet']['suitable']['vegan'] is False
    assert item['nutrition']['provenance'] == 'estimated' and item['nutrition']['source']


def test_unrecognised_dish_has_no_items_and_is_unreliable():
    r = to_food_recognition(verdict(recognized=False), request_id='r')
    assert r['items'] == [] and r['reliable'] is False
    assert r['notes'] == 'Khoya dumplings in syrup.'


def test_name_without_numbers_is_shown_but_not_vouched_for():
    r = to_food_recognition(verdict(with_nutrition=False))
    [item] = r['items']
    assert item['per100g'] == {'kcal': 0, 'proteinG': 0, 'carbsG': 0, 'fatG': 0}
    assert item['estimatedGrams'] == DEFAULT_PORTION_GRAMS
    assert item['nutrition']['provenance'] == 'none'
    assert r['reliable'] is False


def test_unreliable_diet_verdict_makes_the_result_unreliable():
    assert to_food_recognition(verdict(reliable=False))['reliable'] is False


def test_warnings_are_folded_into_notes():
    v = verdict(); v['warnings'] = ['Disagreement: classifier vs taxonomy.']
    r = to_food_recognition(v)
    assert r['notes'].endswith('Disagreement: classifier vs taxonomy.')
    assert r['warnings'] == ['Disagreement: classifier vs taxonomy.']


def test_display_name():
    assert display_name('paneer_butter_masala') == 'Paneer butter masala'
