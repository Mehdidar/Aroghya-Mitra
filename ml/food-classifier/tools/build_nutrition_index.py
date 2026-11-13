"""
build_nutrition_index.py
------------------------
Turns the USDA FoodData Central SR Legacy CSV dump into one compact JSON
file: 7,793 foods, each with its description and per-100g macronutrients.

SR Legacy rather than the Branded set (1.9M items) because it is curated,
small enough to embed, and the entries are generic foods rather than
supermarket products — which is what a dish-level lookup wants.

    python tools/build_nutrition_index.py

Source: https://fdc.nal.usda.gov/download-datasets  (US public domain)
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import csv
import json
import glob

from core.config import ROOT

SRC = glob.glob(os.path.join(ROOT, 'datasets', 'usda',
                             'FoodData_Central_sr_legacy_food_csv_*'))
OUT = os.path.join(ROOT, 'datasets', 'usda', 'nutrition.json')

# FDC nutrient ids -> the fields we keep, all per 100 g
NUTRIENTS = {
    '1008': 'kcal',
    '1003': 'protein_g',
    '1004': 'fat_g',
    '1005': 'carbs_g',
    '1079': 'fiber_g',
    '2000': 'sugars_g',
    '1093': 'sodium_mg',
    '1087': 'calcium_mg',
    '1089': 'iron_mg',
}


def main():
    if not SRC:
        raise SystemExit('USDA CSV dump not found under datasets/usda/')
    src = SRC[0]
    csv.field_size_limit(10 ** 7)

    foods = {}
    with open(os.path.join(src, 'food.csv'), newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            foods[row['fdc_id']] = {'fdc_id': row['fdc_id'],
                                    'description': row['description'],
                                    'category_id': row.get('food_category_id', '')}
    print(f'{len(foods)} foods')

    cats = {}
    with open(os.path.join(src, 'food_category.csv'), newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            cats[row['id']] = row['description']

    kept = 0
    with open(os.path.join(src, 'food_nutrient.csv'), newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            field = NUTRIENTS.get(row['nutrient_id'])
            if field is None:
                continue
            food = foods.get(row['fdc_id'])
            if food is None or not row['amount']:
                continue
            try:
                food[field] = round(float(row['amount']), 2)
            except ValueError:
                continue
            kept += 1
    print(f'{kept} nutrient values kept across {len(NUTRIENTS)} fields')

    out = []
    for food in foods.values():
        if 'kcal' not in food:            # no energy value is no use to us
            continue
        food['category'] = cats.get(food.pop('category_id', ''), '')
        out.append(food)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump({'source': 'USDA FoodData Central, SR Legacy (public domain)',
                   'per': '100 g',
                   'foods': out}, f)
    print(f'wrote {OUT}  ({len(out)} foods with energy, '
          f'{os.path.getsize(OUT)/1e6:.1f} MB)')


if __name__ == '__main__':
    main()
