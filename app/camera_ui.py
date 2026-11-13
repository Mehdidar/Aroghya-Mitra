"""
camera_ui.py
------------
Point-and-shoot dietary check. Opens the device camera on a phone browser
(st.camera_input) with no app build required, or accepts a file upload.

Run:
    .venv/bin/streamlit run app/camera_ui.py

Talks to the FastAPI service when it is up, and falls back to importing the
predictor in-process when it is not, so the UI works either way.
"""

import io
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import requests
import streamlit as st
from PIL import Image

# Candidate API endpoints, in order. DISHDETECT_API wins if set; otherwise
# the UI probes, because port 8000 is commonly already taken on a dev box
# and a hardcoded port meant the UI silently fell back to slow in-process
# inference without saying why.
API_CANDIDATES = [os.environ['DISHDETECT_API']] if os.environ.get('DISHDETECT_API') \
    else ['http://localhost:8000', 'http://localhost:8010', 'http://localhost:8080']

# The deployed service requires a key; a local dev one does not. Sending an
# empty header either way keeps this a one-liner at both ends.
API_HEADERS = {'X-API-Key': os.environ['DISHDETECT_API_KEY']} \
    if os.environ.get('DISHDETECT_API_KEY') else {}

# 'meat_free' is a vegan claim the model declined to make because it did not
# recognise the dish, so it cannot rule out dairy or ghee. It is deliberately
# not green: to someone avoiding dairy this is a "check", not a yes.
TIER_STYLE = {
    'vegan':      ('#0b8457', '🌱', 'Vegan'),
    'vegetarian': ('#b8860b', '🧀', 'Vegetarian'),
    'meat_free':  ('#5b6472', '🤷', 'No meat detected'),
    'non_veg':    ('#b3261e', '🍖', 'Non-Vegetarian'),
}

st.set_page_config(page_title='DishDetect India', page_icon='🍽️', layout='centered')


@st.cache_resource(show_spinner='Loading models…')
def local_predictor():
    from core.predictor import DietPredictor
    return DietPredictor(use_crop='ensemble')


@st.cache_data(ttl=10, show_spinner=False)
def find_api():
    """First candidate whose /health answers, else None (use local inference)."""
    for url in API_CANDIDATES:
        try:
            if requests.get(f'{url}/health', headers=API_HEADERS, timeout=2).ok:
                return url
        except requests.RequestException:
            continue
    return None


def run(img_bytes):
    url = find_api()
    if url:
        r = requests.post(f'{url}/predict',
                          files={'file': ('photo.jpg', img_bytes, 'image/jpeg')},
                          headers=API_HEADERS, timeout=120)
        if r.status_code == 401:
            raise RuntimeError('API rejected the key — set DISHDETECT_API_KEY')
        if r.status_code == 429:
            raise RuntimeError('rate limited — wait a moment and try again')
        r.raise_for_status()
        return r.json(), 'api'
    img = Image.open(io.BytesIO(img_bytes))
    return local_predictor().predict(img), 'local'


st.title('🍽️ DishDetect India')
st.caption('Take a photo of a dish — get its name, what it contains, and whether it is vegan.')

mode = st.radio('Input', ['📷 Camera', '📁 Upload'], horizontal=True, label_visibility='collapsed')
shot = st.camera_input('Point at the dish') if mode == '📷 Camera' \
    else st.file_uploader('Choose a photo', type=['jpg', 'jpeg', 'png', 'webp'])

if shot is None:
    st.info('Waiting for a photo.')
    st.stop()

img_bytes = shot.getvalue()
with st.spinner('Analysing…'):
    try:
        res, via = run(img_bytes)
    except Exception as e:
        st.error(f'Prediction failed: {e}')
        st.stop()

col_img, col_res = st.columns([1, 1.3])
with col_img:
    st.image(img_bytes, use_container_width=True)
    st.caption(f"crop: `{res['crop_method']}` · via {via}"
               + (f" · {res['inference_ms']:.0f} ms" if 'inference_ms' in res else ''))

with col_res:
    tier = res['diet']['tier']
    # Never KeyError on a tier the API learned after this build shipped.
    colour, icon, short = TIER_STYLE.get(tier, ('#5b6472', '❓', tier))
    reliable = res['diet']['reliable']

    st.markdown(
        f"<div style='background:{colour};color:#fff;padding:18px 20px;"
        f"border-radius:14px;margin-bottom:14px'>"
        f"<div style='font-size:13px;opacity:.85;letter-spacing:.08em'>VERDICT</div>"
        f"<div style='font-size:30px;font-weight:650;line-height:1.15'>{icon} {short}</div>"
        f"<div style='font-size:14px;opacity:.9;margin-top:6px'>"
        f"{res['diet']['confidence']*100:.0f}% confidence"
        f"{'' if reliable else ' · needs review'}</div>"
        + ("<div style='font-size:13px;opacity:.92;margin-top:10px;line-height:1.4'>"
           f"{res.get('rationale','')}</div>"
           if tier == 'meat_free' else '')
        + "</div>",
        unsafe_allow_html=True,
    )

    if res['dish']['recognized']:
        st.markdown(f"**Dish** · {res['dish']['name']}  \n"
                    f"<span style='color:#666;font-size:13px'>"
                    f"{res['dish']['confidence']*100:.0f}% confident</span>",
                    unsafe_allow_html=True)
    else:
        st.markdown('**Dish** · not recognised')
        st.caption('No dish name is shown: either no Indian dish model is '
                   'trained yet or it was not confident enough. The verdict '
                   'above comes from the veg/non-veg model.')

    if res.get('ingredients'):
        st.markdown(f"**Typical ingredients** · {res['ingredients']}")
    if res.get('animal_byproduct'):
        st.markdown(f"**Animal product** · {res['animal_byproduct']}")
    if res.get('rationale') and tier != 'meat_free':
        st.markdown(f"**Why** · {res['rationale']}")

NUTRI_BADGE = {
    'verified':  ('#0b8457', 'USDA verified',
                  'Hand-checked match to a USDA FoodData Central entry.'),
    'estimated': ('#b8860b', 'Estimate',
                  'An approximation — read the note before relying on it.'),
}

nutri = res.get('nutrition') or {}
prov = nutri.get('provenance')
if prov in NUTRI_BADGE:
    colour, label, blurb = NUTRI_BADGE[prov]
    st.divider()
    st.markdown(
        f"<div style='display:flex;align-items:center;gap:10px;margin-bottom:6px'>"
        f"<span style='font-size:19px;font-weight:650'>Nutrition</span>"
        f"<span style='background:{colour};color:#fff;font-size:11px;font-weight:600;"
        f"letter-spacing:.06em;padding:3px 9px;border-radius:999px'>{label.upper()}</span>"
        f"<span style='color:#86868b;font-size:13px'>per 100 g</span></div>",
        unsafe_allow_html=True)
    st.caption(f"{blurb}  Matched to **{nutri.get('matched','—')}** "
               f"(FDC {nutri.get('fdc_id','—')}). {nutri.get('source','')}")

    n = nutri.get('nutrients', {})
    labels = [('kcal', 'Energy', 'kcal'), ('protein_g', 'Protein', 'g'),
              ('fat_g', 'Fat', 'g'), ('carbs_g', 'Carbs', 'g'),
              ('fiber_g', 'Fibre', 'g'), ('sodium_mg', 'Sodium', 'mg')]
    shown = [(lab, n[key], unit) for key, lab, unit in labels if key in n]
    if shown:
        for row in range(0, len(shown), 3):
            for col, (lab, val, unit) in zip(st.columns(3), shown[row:row + 3]):
                col.metric(lab, f"{val:g} {unit}")

    if nutri.get('note'):
        (st.info if prov == 'verified' else st.warning)(nutri['note'])

elif prov == 'none' and res['dish']['recognized']:
    st.divider()
    st.markdown("**Nutrition** · not available")
    st.caption(nutri.get('reason', 'No USDA analogue for this dish.'))

for w in res.get('warnings', []):
    st.warning(w)

agree = res['lookup']['agreement']
if agree is True:
    st.success('Cross-check passed — the image classifier and the dish taxonomy agree.')
elif agree is False:
    st.error('Cross-check failed — the image classifier and the dish taxonomy disagree. '
             'Do not rely on this result.')

with st.expander('Raw model output'):
    st.json(res)
