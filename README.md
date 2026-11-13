# DishDetect India

Photo in → dish name, dietary tier (non-veg / vegetarian / vegan), ingredients,
and an honest confidence. The Indian-food sibling of the Saudi DishDetect
project in `../food_classifier`, using the same pipeline and starting from the
models trained there.

## Where this stands

| Piece | State |
|---|---|
| Pipeline code (crop, three heads, cross-check, open-set guard, API, camera UI) | Carried over, working |
| Saudi checkpoints (`checkpoints/pretrained_saudi/`) | Copied in: warm-start for training, stand-in for veg/vegan until retrained |
| Indian taxonomy (`core/indian_taxonomy.json`) | 43 dishes written: 15 non-veg, 19 vegetarian, 9 vegan |
| Indian training images | **None yet — this is the next step** |
| Indian dish / veg / vegan heads | Not trained |
| Nutrition map (`core/nutrition_map.json`) | Empty; figures fall back to automatic USDA retrieval, labelled "estimated" |
| Thresholds in `core/config.py` | Inherited from the Saudi sweep; must be re-swept after training |

The predictor runs today, but only as a demonstration: the veg and vegan heads
are the Saudi models, no dish is named, every result is marked unreliable, and
"vegan" is never claimed. The Saudi models have not been measured on Indian
food.

## Setup

```bash
cd indian_food_classifier
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -m "not slow"     # 135 pass before any training
```

To reuse the Saudi project's environment instead of creating a new one, prefix
commands with `PY=../food_classifier/.venv/bin/python` or call that Python
directly.

## Training the Indian models

### 1. Collect images

One folder per dish, named as the dish is keyed in `core/indian_taxonomy.json`
(case, spaces and hyphens are forgiven: `Palak Paneer` matches `palak_paneer`):

```
datasets/raw/palak_paneer/*.jpg
datasets/raw/chicken_biryani/*.jpg
...
```

Aim for at least 50 images per dish; the Saudi dish head had about 55 per dish
and reached 78% (88% with the CLIP probe). Fewer than 20 is too few to split
into train / val / test.

Keep a separate set of real restaurant photos out of training entirely, in
`datasets/benchmark/<dish>/`. That set is what the final accuracy is quoted on.

A dish that is not in the taxonomy yet needs an entry there first — the
taxonomy is the only source of dietary labels.

### 2. Crop, then derive the three training sets

```bash
python tools/make_crops.py --input datasets/raw --output datasets/grabcut_dataset
python tools/build_diet_datasets.py --source datasets/grabcut_dataset
```

The second command prints any folder it could not match to the taxonomy and
any dish with too few images.

### 3. Train, starting from the Saudi checkpoints

```bash
python scripts/train.py --dataset datasets/derived/veg_binary   --run veg_indian   --img_size 344 --init saudi
python scripts/train.py --dataset datasets/derived/vegan_binary --run vegan_indian --img_size 288 --init saudi
python scripts/train.py --dataset datasets/derived/dishes       --run dish_indian  --img_size 320 --init saudi
```

`--init saudi` loads the matching Saudi checkpoint. The veg and vegan heads
load completely (same two classes); the dish head loads the backbone and
trains a new final layer for the Indian dish list. Drop `--init` to start from
ImageNet instead and compare — warm-starting is a hypothesis, not a measured
win.

The run names matter: `core/config.py` looks for `checkpoints/<run>_best.pth`
and `results/runs/<run>/`. As soon as those exist the predictor serves the
Indian head in place of the stand-in.

### 4. Open-set index, CLIP probes, thresholds

```bash
python tools/build_openset_index.py                          # "is this a dish we know?"
python tools/clip_probe.py --head dish --views ensemble --save
python tools/clip_probe.py --head veg  --views ensemble --save
python tools/vegan_threshold_sweep.py                        # then set VEGAN_THRESHOLD
python tools/benchmark_predictor.py --ensemble               # needs datasets/benchmark/
```

In the Saudi project the CLIP probe beat the fine-tuned dish head by 12 points
on about 1,100 images. `clip_probe.py` prints both numbers on the same split;
only keep the saved probe if it wins here too (delete
`checkpoints/clip_probe_<head>.joblib` to go back to the MobileNet head).

## Running it

```bash
python scripts/predict.py --image photo.jpg
./run_app.sh                                  # API + camera UI (expects .venv/)
```

## What is different from the Saudi project

- **Egg is non-vegetarian**, following Indian labelling convention. "Vegetarian"
  here means lacto-vegetarian.
- **Ghee is the hard problem.** Dal tadka, dosa and roti are plant-based or not
  depending on a fat that cannot be seen. The taxonomy marks a dish vegan only
  where the traditional recipe is oil-based, and marks dal tadka and masala
  dosa vegetarian. These are judgement calls — review them.
- `arabic` in the taxonomy and API output is now `local_name` (Devanagari).
- The dataset builder takes a flat `<dish>/` layout and reads veg / non-veg
  from the taxonomy rather than from a parent folder name.
- `train.py` has `--init`; `core/config.py` has `BASELINES`.
- Not carried over: the mobile app, Dockerfile and deploy files, the report
  generators, and everything the Saudi `STRUCTURE.md` lists as historical.

## Layout

```
core/config.py              paths, resolutions, thresholds — start here
core/indian_taxonomy.json   dish → diet, ingredients, rationale
core/predictor.py           three heads + lookup + cross-check + abstention
scripts/train.py            two-stage training, --init for warm start
tools/                      crops, dataset builder, open-set index, probes, benchmark
api/, app/camera_ui.py      FastAPI service and Streamlit camera page
checkpoints/pretrained_saudi/   the three Saudi models
tests/                      pytest; tests that need trained Indian heads skip until they exist
```
