"""
main.py
-------
FastAPI service wrapping core.predictor.DietPredictor.

Run:
    .venv/bin/uvicorn api.main:app --reload --port 8000

Endpoints:
    GET  /health      model + device status, model version, auth mode
    GET  /dishes      the dish vocabulary and its dietary tiers
    POST /predict     multipart image upload -> full dietary verdict
    POST /ai/food     the same upload, in the mobile app's FoodRecognition
                      shape (api/food.py): dish, portion, macros, diet
    POST /asha/sync   the ASHA app's outbox -> what changed on the server
    POST /asha/photos visit photo upload -> {url}   (api/asha.py)
    GET  /asha/photos/<name>   serves an uploaded photo
    POST /feedback    a correction against a request_id -> review queue

The model is loaded once at startup, not per request.

/predict is authenticated and rate limited (api/security.py) and every
prediction is logged (api/telemetry.py). Set DISHDETECT_ENV=prod and
DISHDETECT_API_KEYS before exposing this to a network.
"""

import io
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

from core import taxonomy
from core import nutrition as nutrition_mod
from core import diet as diet_mod
from core.config import HEADS
from core.predictor import DietPredictor
from . import feedback as fb
from . import food as food_shape
from . import asha as asha_sync
from . import security, telemetry

MAX_UPLOAD_BYTES = 12 * 1024 * 1024

# '*' suits a mobile client, which does not enforce CORS at all. Narrow it
# with DISHDETECT_CORS_ORIGINS the moment a browser front end exists.
CORS_ORIGINS = [o.strip() for o in
                os.environ.get('DISHDETECT_CORS_ORIGINS', '*').split(',') if o.strip()]

_state = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    security.check_startup()
    t0 = time.time()
    predictor = DietPredictor(use_crop='ensemble')

    # Warm the lazily-loaded pieces so the first real request is not the one
    # that pays for them. The open-set encoder (OpenCLIP) loads on first use
    # and was costing the first caller ~4s.
    try:
        from PIL import Image
        predictor.predict(Image.new('RGB', (320, 320), (127, 127, 127)))
        _state['warm'] = True
    except Exception:
        _state['warm'] = False

    _state['predictor'] = predictor
    _state['load_seconds'] = round(time.time() - t0, 2)
    _state['model_version'] = telemetry.model_version()
    yield
    _state.clear()


app = FastAPI(
    title='DishDetect India — Dietary Intelligence API',
    description='Photo in, dish name and dietary verdict out.',
    version='1.0.0',
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/health')
def health():
    p = _state.get('predictor')
    if p is None:
        raise HTTPException(503, 'model not loaded')
    return {
        'status': 'ok',
        'device': str(p.device),
        'model_version': _state.get('model_version'),
        'env': security.ENV,
        'auth': 'required' if security.auth_enabled() else 'open',
        'rate_limit_per_min': security.RATE_PER_MIN,
        'logging_images': telemetry.LOG_IMAGES,
        'served_by': p.served_by,
        'load_seconds': _state.get('load_seconds'),
        'warm': _state.get('warm'),
        'heads': {
            name: {'img_size': HEADS[name]['img_size'], 'classes': len(h.classes)}
            for name, h in p.heads.items()
        },
    }


@app.get('/dishes')
def dishes():
    return {
        'count': len(taxonomy.known_dishes()),
        'tier_counts': taxonomy.tier_counts(),
        'dishes': [taxonomy.info(d) for d in taxonomy.known_dishes()],
    }


@app.get('/nutrition/{dish}')
def nutrition(dish: str):
    """Nutrition for a dish name, with explicit provenance."""
    info = taxonomy.info(dish)
    out = nutrition_mod.for_dish(dish, info.get('key_ingredients'))
    out['restrictions'] = diet_mod.restrictions(dish, out)
    return out


async def _run(file: UploadFile, caller: str):
    """Decode, predict, log. Shared by /predict and /ai/food."""
    raw = await file.read()
    if not raw:
        raise HTTPException(400, 'empty upload')
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f'file larger than {MAX_UPLOAD_BYTES // (1024*1024)}MB')

    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, 'could not decode image')

    p = _state.get('predictor')
    if p is None:
        raise HTTPException(503, 'model not loaded')

    t0 = time.time()
    result = p.predict(img)
    latency = round((time.time() - t0) * 1000, 1)

    request_id = uuid.uuid4().hex[:12]
    result['inference_ms'] = latency
    result['filename'] = file.filename
    result['model_version'] = _state.get('model_version')
    result['request_id'] = request_id

    telemetry.record(result, raw=raw, request_id=request_id, caller=caller,
                     latency_ms=latency, image_size=img.size)
    return result


@app.post('/predict')
async def predict(file: UploadFile = File(...), caller: str = Depends(security.caller)):
    return await _run(file, caller)


@app.post('/ai/food')
async def ai_food(file: UploadFile = File(...), caller: str = Depends(security.caller)):
    """The mobile app's food endpoint: one dish, its portion, macros and
    dietary restrictions, in the FoodRecognition shape. Same auth, rate
    limit and telemetry as /predict; `requestId` feeds /feedback."""
    result = await _run(file, caller)
    return food_shape.to_food_recognition(result, request_id=result.get('request_id'))


@app.post('/feedback')
async def feedback(payload: dict, caller: str = Depends(security.caller)):
    """Record a user correction.

    This writes to a review queue. It does not change the model, the
    taxonomy or any threshold: a correction is a labelled photograph
    awaiting verification, and an endpoint that trained on it directly
    would be an endpoint for making a dietary app unsafe. See
    api/feedback.py for the reasoning.
    """
    try:
        row = fb.submit(
            request_id=payload.get('request_id'),
            kind=payload.get('kind', 'other'),
            correct_dish=payload.get('correct_dish'),
            correct_tier=payload.get('correct_tier'),
            note=payload.get('note'),
            caller=caller,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {'ok': True, 'id': row['id'], 'state': row['state'],
            'note': 'Queued for review. Corrections are verified before they '
                    'reach the model.'}


@app.get('/feedback/stats')
def feedback_stats(caller: str = Depends(security.caller)):
    rows = fb.load()
    by_state, by_kind = {}, {}
    for r in rows:
        by_state[r['state']] = by_state.get(r['state'], 0) + 1
        by_kind[r['kind']] = by_kind.get(r['kind'], 0) + 1
    unknown = sorted({r['correct_dish'] for r in rows
                      if r.get('correct_dish') and r.get('dish_in_taxonomy') is False})
    return {'total': len(rows), 'by_state': by_state, 'by_kind': by_kind,
            # Dishes users named that the taxonomy does not have: the
            # ranked shortlist for what to add to the vocabulary next.
            'dishes_not_in_taxonomy': unknown}


# ----------------------------------------------------------------- ASHA sync

@app.post('/asha/sync')
async def asha_sync_route(payload: dict, caller: str = Depends(security.caller)):
    """The ASHA app's push+pull round (api/asha.py). Same auth and rate
    limit as /predict; the app sends its session token as a Bearer header,
    which is accepted but not yet verified."""
    try:
        return asha_sync.sync(payload)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post('/asha/photos')
async def asha_photo_upload(request: Request, file: UploadFile = File(...),
                            caller: str = Depends(security.caller)):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, 'empty upload')
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f'file larger than {MAX_UPLOAD_BYTES // (1024*1024)}MB')
    try:
        Image.open(io.BytesIO(raw)).verify()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, 'could not decode image')
    name, path = asha_sync.photo_path(file.filename)
    with open(path, 'wb') as f:
        f.write(raw)
    return {'url': str(request.base_url).rstrip('/') + f'/asha/photos/{name}'}


@app.get('/asha/photos/{name}')
def asha_photo(name: str):
    if asha_sync._SAFE_NAME.search(name) or '..' in name:
        raise HTTPException(404)
    path = os.path.join(asha_sync.ROOT_DIR, 'photos', name)
    if not os.path.isfile(path):
        raise HTTPException(404)
    return FileResponse(path)
