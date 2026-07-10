"""
Corporate-grade face recognition microservice for Yoyo GYM.

Engine:  InsightFace `buffalo_l`  =  RetinaFace (detection) + ArcFace (512-D
         embeddings).  Far more accurate than in-browser face-api.js.

Exposes:
  - REST JSON API (for the React/Node gym app to call)
  - A Gradio webcam UI at /ui (enrol + verify from a phone browser)

Matching:  cosine similarity on L2-normalised ArcFace embeddings.
           similarity >= THRESHOLD  =>  same person.

Runs free on a Hugging Face Space (Docker SDK) or locally + ngrok.
CPU-only by default; set FACE_USE_GPU=1 on a GPU box.
"""
import base64
import io
import json
import os
import threading
from typing import Optional

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

# ── Config ──────────────────────────────────────────────────────────────────
# A permissive absolute threshold plus a person-level margin: the margin, not a
# punishing cut-off, is what keeps look-alikes out, so a member survives a new
# beard/haircut/makeup without being locked out.
THRESHOLD = float(os.getenv("FACE_THRESHOLD", "0.36"))   # cosine sim for a match
MARGIN = float(os.getenv("FACE_MARGIN", "0.05"))         # best must beat 2nd by this
MAX_TEMPLATES = int(os.getenv("FACE_MAX_TEMPLATES", "10"))  # gallery size per person
FLIP_TTA = os.getenv("FACE_FLIP_TTA", "1") != "0"        # average with mirror image
DATA_DIR = os.getenv("FACE_DATA_DIR", "/data" if os.path.isdir("/data") else ".")
STORE_PATH = os.path.join(DATA_DIR, "faces.json")
API_KEY = os.getenv("FACE_API_KEY")                      # optional shared secret
PORT = int(os.getenv("PORT", "7860"))
USE_GPU = os.getenv("FACE_USE_GPU") == "1"

# ── InsightFace (loaded once, lazily) ───────────────────────────────────────
_engine = None
_engine_lock = threading.Lock()


def get_engine():
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                from insightface.app import FaceAnalysis
                providers = (
                    ["CUDAExecutionProvider", "CPUExecutionProvider"]
                    if USE_GPU
                    else ["CPUExecutionProvider"]
                )
                fa = FaceAnalysis(name="buffalo_l", providers=providers)
                fa.prepare(ctx_id=0 if USE_GPU else -1, det_size=(640, 640))
                _engine = fa
    return _engine


# ── Enrolment store (member_id -> GALLERY of normalised 512-D embeddings) ────
# Each member keeps several templates (different looks), so a probe only has to
# resemble one of them. This is the standalone-mode store; when the gym app is
# wired up, matching happens in Node against Supabase and only /embed[-batch] is
# used. The store degrades gracefully from the old single-vector JSON format.
_store_lock = threading.Lock()
_gallery: dict[str, list] = {}  # member_id -> list[np.ndarray(512,)]


def _load_store():
    global _gallery
    if os.path.exists(STORE_PATH):
        try:
            with open(STORE_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
            gallery = {}
            for mid, val in raw.items():
                # New format: list of vectors. Old format: a single vector.
                vecs = val if val and isinstance(val[0], list) else [val]
                gallery[mid] = [np.asarray(v, dtype=np.float32) for v in vecs]
            _gallery = gallery
        except Exception as e:  # noqa: BLE001
            print("store load failed:", e)


def _save_store():
    data = {mid: [v.tolist() for v in vecs] for mid, vecs in _gallery.items()}
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f)


def _upsert(member_id: str, emb: np.ndarray):
    """Append a template to the member's gallery (rolling window, capped)."""
    with _store_lock:
        vecs = _gallery.get(member_id, [])
        # Skip a near-duplicate of a template we already hold — keep diversity.
        if any(float(v @ emb) >= 0.92 for v in vecs):
            return
        vecs.append(emb)
        _gallery[member_id] = vecs[-MAX_TEMPLATES:]
        _save_store()


def _identify(emb: np.ndarray):
    """Return (member_id, similarity, confident) — closest template per person,
    with a person-level margin over the runner-up."""
    if not _gallery:
        return None, 0.0, False
    scores = [(mid, max(float(v @ emb) for v in vecs)) for mid, vecs in _gallery.items() if vecs]
    if not scores:
        return None, 0.0, False
    scores.sort(key=lambda x: -x[1])
    best_id, best = scores[0]
    second = scores[1][1] if len(scores) > 1 else -1.0
    confident = best >= THRESHOLD and (best - second) >= MARGIN
    return best_id, best, confident


def _enrolled_count():
    return len(_gallery)


# ── Image helpers ───────────────────────────────────────────────────────────
def _decode(image: str) -> np.ndarray:
    """data:URL or raw base64 -> RGB numpy array."""
    if "," in image and image.strip().startswith("data:"):
        image = image.split(",", 1)[1]
    raw = base64.b64decode(image)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.array(img)


def _l2(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n else v


def _largest_face(rgb: np.ndarray):
    """Detect faces and return the largest one's normalised embedding + meta.

    Flip test-time augmentation: the embedding is averaged with that of the
    horizontally-mirrored crop and re-normalised. A face is near-symmetric, so
    the mirror is a free extra "view" that cancels some pose/lighting noise and
    makes the template a little more robust to appearance changes.
    """
    faces = get_engine().get(rgb[:, :, ::-1])  # InsightFace expects BGR
    if not faces:
        return None
    faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)
    f = faces[0]
    emb = np.asarray(f.normed_embedding, dtype=np.float32)

    if FLIP_TTA:
        flipped = get_engine().get(rgb[:, ::-1, ::-1])  # mirror, then to BGR
        if flipped:
            flipped.sort(key=lambda g: (g.bbox[2] - g.bbox[0]) * (g.bbox[3] - g.bbox[1]), reverse=True)
            emb2 = np.asarray(flipped[0].normed_embedding, dtype=np.float32)
            emb = _l2(emb + emb2)

    return {
        "embedding": emb,
        "det_score": float(f.det_score),
        "bbox": [float(x) for x in f.bbox],
        "count": len(faces),
    }


# ── API ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="Yoyo GYM Face Service", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ImageIn(BaseModel):
    image: str
    api_key: Optional[str] = None


class EnrollIn(ImageIn):
    member_id: str


class CompareIn(BaseModel):
    image_a: str
    image_b: str
    api_key: Optional[str] = None


class BatchIn(BaseModel):
    images: list[str]
    api_key: Optional[str] = None


def _auth(key: Optional[str]):
    return not API_KEY or key == API_KEY


@app.on_event("startup")
def _startup():
    _load_store()


@app.get("/health")
def health():
    return {"ok": True, "enrolled": _enrolled_count(), "threshold": THRESHOLD, "gpu": USE_GPU}


@app.post("/embed")
def embed(body: ImageIn):
    """Detect the primary face and return its 512-D ArcFace embedding."""
    if not _auth(body.api_key):
        return {"ok": False, "error": "unauthorized"}
    face = _largest_face(_decode(body.image))
    if not face:
        return {"ok": False, "error": "no_face"}
    return {
        "ok": True,
        "embedding": face["embedding"].tolist(),
        "det_score": face["det_score"],
        "faces": face["count"],
    }


@app.post("/embed-batch")
def embed_batch(body: BatchIn):
    """Embed several images in one call — used for multi-pose enrolment so the
    app collects a gallery of looks without a round trip per pose."""
    if not _auth(body.api_key):
        return {"ok": False, "error": "unauthorized"}
    results = []
    for image in body.images or []:
        try:
            face = _largest_face(_decode(image))
        except Exception as e:  # noqa: BLE001
            results.append({"ok": False, "error": f"decode_failed: {e}"})
            continue
        if not face:
            results.append({"ok": False, "error": "no_face"})
            continue
        results.append(
            {
                "ok": True,
                "embedding": face["embedding"].tolist(),
                "det_score": face["det_score"],
                "faces": face["count"],
            }
        )
    return {"ok": True, "results": results}


@app.post("/enroll")
def enroll(body: EnrollIn):
    """Store (or update) a member's face template."""
    if not _auth(body.api_key):
        return {"ok": False, "error": "unauthorized"}
    if not body.member_id.strip():
        return {"ok": False, "error": "member_id required"}
    face = _largest_face(_decode(body.image))
    if not face:
        return {"ok": False, "error": "no_face"}
    if face["det_score"] < 0.5:
        return {"ok": False, "error": "low_quality"}
    _upsert(body.member_id.strip(), face["embedding"])
    return {"ok": True, "member_id": body.member_id.strip(), "enrolled": _enrolled_count()}


@app.post("/verify")
def verify(body: ImageIn):
    """Identify the face against all enrolled members (1:N login)."""
    if not _auth(body.api_key):
        return {"ok": False, "error": "unauthorized"}
    face = _largest_face(_decode(body.image))
    if not face:
        return {"ok": False, "error": "no_face"}
    member_id, sim, confident = _identify(face["embedding"])
    return {
        "ok": True,
        "match": confident,
        "member_id": member_id if confident else None,
        "similarity": round(sim, 4),
        "threshold": THRESHOLD,
    }


@app.post("/compare")
def compare(body: CompareIn):
    """Cosine similarity between the faces in two images (1:1)."""
    if not _auth(body.api_key):
        return {"ok": False, "error": "unauthorized"}
    a = _largest_face(_decode(body.image_a))
    b = _largest_face(_decode(body.image_b))
    if not a or not b:
        return {"ok": False, "error": "no_face"}
    sim = float(a["embedding"] @ b["embedding"])
    return {"ok": True, "similarity": round(sim, 4), "same_person": sim >= THRESHOLD}


# ── Gradio webcam UI (mounted at /ui) ───────────────────────────────────────
def _build_ui():
    import gradio as gr

    def ui_enroll(img, member_id):
        if img is None or not (member_id or "").strip():
            return "Enter a member number and capture a face."
        face = _largest_face(np.array(img))
        if not face:
            return "No face detected — try again with better lighting."
        if face["det_score"] < 0.5:
            return "Face too unclear — move closer / improve lighting."
        _upsert(member_id.strip(), face["embedding"])
        return f"✅ Enrolled {member_id.strip()} (quality {face['det_score']:.2f}). Total: {_enrolled_count()}."

    def ui_verify(img):
        if img is None:
            return "Capture a face to verify."
        face = _largest_face(np.array(img))
        if not face:
            return "No face detected."
        mid, sim, confident = _identify(face["embedding"])
        if confident:
            return f"✅ MATCH: {mid}  (similarity {sim:.3f})"
        return f"❌ Not recognised (best {sim:.3f}, need ≥ {THRESHOLD})."

    with gr.Blocks(title="Yoyo GYM Face Access") as ui:
        gr.Markdown("## Yoyo GYM — Face Access (InsightFace ArcFace + RetinaFace)")
        with gr.Tab("Enrol"):
            e_img = gr.Image(sources=["webcam", "upload"], type="pil", label="Face")
            e_id = gr.Textbox(label="Member number (e.g. GYM-2026-XXXXXX)")
            e_btn = gr.Button("Enrol face", variant="primary")
            e_out = gr.Textbox(label="Result")
            e_btn.click(ui_enroll, [e_img, e_id], e_out)
        with gr.Tab("Verify / Login"):
            v_img = gr.Image(sources=["webcam", "upload"], type="pil", label="Face")
            v_btn = gr.Button("Verify", variant="primary")
            v_out = gr.Textbox(label="Result")
            v_btn.click(ui_verify, [v_img], v_out)
    return ui


try:
    import gradio as gr  # noqa: F401

    app = gr.mount_gradio_app(app, _build_ui(), path="/ui")
except Exception as e:  # noqa: BLE001
    print("Gradio UI not mounted:", e)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
