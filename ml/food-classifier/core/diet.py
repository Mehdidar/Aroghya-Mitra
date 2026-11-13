"""
diet.py
-------
Dietary restrictions for a recognised dish: allergens, who the dish suits,
and cautions for common conditions.

Everything here is derived from two curated sources and nothing else:

    core/indian_taxonomy.json    diet tier (non_veg / vegetarian / vegan)
    core/indian_nutrition.json   allergens, recipe tags, onion/garlic, and
                                 the per-100 g nutrients the thresholds use

Cautions are deliberately coarse. Three levels of evidence exist for a
photo: the dish identity, the typical recipe, and the typical portion. None
of them is the plate in front of the user, so a caution says "this kind of
dish is usually high in X", never "you must not eat this". Thresholds are
per 100 g as served, and are documented next to each rule.

An unknown dish yields no allergens and no cautions, with every 'suitable'
flag None: silence, not a guess.
"""

from . import taxonomy
from . import nutrition

ALLERGENS = ('dairy', 'egg', 'gluten', 'nuts', 'peanut', 'sesame', 'soy',
             'fish', 'shellfish', 'poppy')

# Caution codes the app translates. (code, level) pairs only; the reason is
# an English sentence for API consumers and logs.
CAUTIONS = ('diabetes', 'hypertension', 'heart', 'energy_dense')

# Thresholds, per 100 g as served.
SUGAR_HIGH_G = 10        # sweets start around 15-45 g; a savoury dish is < 5
CARBS_REFINED_G = 45     # refined-flour dish this starchy: fast carbohydrate
SODIUM_HIGH_MG = 450     # ~1/4 of the WHO 2 g/day limit in 100 g
SODIUM_MOD_MG = 350
FAT_HIGH_G = 15          # with a fried / ghee / cream recipe
KCAL_DENSE = 350         # energy density of fried snacks and most mithai


def _suitable(tier, allergens, onion_garlic):
    if tier is None:
        return {k: None for k in ('vegetarian', 'vegan', 'egg_free', 'dairy_free',
                                  'gluten_free', 'nut_free', 'no_onion_garlic')}
    a = set(allergens)
    return {
        'vegetarian': tier != 'non_veg',
        'vegan': tier == 'vegan',
        'egg_free': 'egg' not in a,
        'dairy_free': 'dairy' not in a,
        'gluten_free': 'gluten' not in a,
        'nut_free': not (a & {'nuts', 'peanut'}),
        'no_onion_garlic': None if onion_garlic is None else not onion_garlic,
    }


def _cautions(nutrients, tags):
    out = []
    if not nutrients:
        return out
    t = set(tags or ())
    sugar = nutrients.get('sugars_g') or 0
    carbs = nutrients.get('carbs_g') or 0
    sodium = nutrients.get('sodium_mg') or 0
    fat = nutrients.get('fat_g') or 0
    kcal = nutrients.get('kcal') or 0

    if 'sweet' in t or sugar >= SUGAR_HIGH_G:
        out.append(('diabetes', 'high',
                    f'A sweet dish: about {sugar:g} g sugar per 100 g.'))
    elif 'refined_flour' in t and carbs >= CARBS_REFINED_G:
        out.append(('diabetes', 'moderate',
                    'Made with refined flour, so its carbohydrate is absorbed fast.'))

    if sodium >= SODIUM_HIGH_MG:
        out.append(('hypertension', 'high',
                    f'High in salt: about {sodium:g} mg sodium per 100 g.'))
    elif sodium >= SODIUM_MOD_MG:
        out.append(('hypertension', 'moderate',
                    f'Moderately salty: about {sodium:g} mg sodium per 100 g.'))

    rich = t & {'deep_fried', 'rich_dairy_fat', 'red_meat'}
    if rich and fat >= FAT_HIGH_G:
        out.append(('heart', 'high',
                    'Fried, or rich in ghee, butter, cream or red meat, and high in fat.'))
    elif rich:
        out.append(('heart', 'moderate',
                    'Usually cooked with ghee, butter or cream, deep-fried, or made with red meat.'))

    if kcal >= KCAL_DENSE:
        out.append(('energy_dense', 'high',
                    f'Energy-dense: about {kcal:g} kcal per 100 g.'))
    return [{'code': c, 'level': l, 'reason': r} for c, l, r in out]


def restrictions(dish, nutrition_result=None):
    """
    Dietary restrictions for `dish` (a taxonomy key, or None).

    `nutrition_result` is what core.nutrition.for_dish returned, so the
    nutrients the cautions are judged on are exactly the ones shown to the
    user. When it is omitted it is looked up here.
    """
    info = taxonomy.info(dish) if dish else None
    tier = info['tier'] if info and info['known'] else None
    if nutrition_result is None and dish:
        nutrition_result = nutrition.for_dish(dish, info.get('key_ingredients') if info else None)
    cur = nutrition.curated(dish) if dish else None

    allergens = list(cur['allergens']) if cur else []
    tags = list(cur['tags']) if cur else []
    onion_garlic = cur.get('onion_garlic') if cur else None
    nutrients = (nutrition_result or {}).get('nutrients') if nutrition_result else None

    return {
        'tier': tier,
        'allergens': allergens,
        'contains_onion_garlic': onion_garlic,
        'suitable': _suitable(tier, allergens, onion_garlic),
        'cautions': _cautions(nutrients, tags) if cur else [],
        'animal_byproduct': info['animal_byproduct'] if info else None,
        'basis': ('taxonomy + curated nutrition table' if cur
                  else 'taxonomy only' if tier else 'dish not identified'),
    }
