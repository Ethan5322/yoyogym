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
THRESHOLD = float(os.getenv("FACE_THRESHOLD", "0.45"))   # cosine sim for a match
MARGIN = float(os.getenv("FACE_MARGIN", "0.04"))         # best must beat 2nd by this
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


# ── Enrolment store (member_id -> normalised 512-D embedding) ────────────────
_store_lock = threading.Lock()
_ids: list[str] = []
_mat: Optional[np.ndarray] = None  # shape (N, 512), L2-normalised


def _load_store():
    global _ids, _mat
    if os.path.exists(STORE_PATH):
        try:
            with open(STORE_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
            _ids = list(raw.keys())
            _mat = np.array([raw[k] for k in _ids], dtype=np.float32) if _ids else None
        except Exception as e:  # noqa: BLE001
            print("store load failed:", e)


def _save_store():
    if _mat is None:
        data = {}
    else:
        data = {mid: _mat[i].tolist() for i, mid in enumerate(_ids)}
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f)


def _upsert(member_id: str, emb: np.ndarray):
    global _ids, _mat
    with _store_lock:
        if member_id in _ids:
            _mat[_ids.index(member_id)] = emb
        else:
            _ids.append(member_id)
            _mat = emb[None, :] if _mat is None else np.vstack([_mat, emb])
        _save_store()


def _identify(emb: np.ndarray):
    """Return (member_id, similarity, confident) for the closest enrolment."""
    if _mat is None or not len(_ids):
        return None, 0.0, False
    sims = _mat @ emb  # cosine similarity (all vectors are L2-normalised)
    order = np.argsort(-sims)
    best_i = int(order[0])
    best = float(sims[best_i])
    second = float(sims[int(order[1])]) if len(order) > 1 else -1.0
    confident = best >= THRESHOLD and (best - second) >= MARGIN
    return _ids[best_i], best, confident


# ── Image helpers ───────────────────────────────────────────────────────────
def _decode(image: str) -> np.ndarray:
    """data:URL or raw base64 -> RGB numpy array."""
    if "," in image and image.strip().startswith("data:"):
        image = image.split(",", 1)[1]
    raw = base64.b64decode(image)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.array(img)


def _largest_face(rgb: np.ndarray):
    """Detect faces and return the largest one's normalised embedding + meta."""
    faces = get_engine().get(rgb[:, :, ::-1])  # InsightFace expects BGR
    if not faces:
        return None
    faces.sort(key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]), reverse=True)
    f = faces[0]
    emb = np.asarray(f.normed_embedding, dtype=np.float32)
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


def _auth(key: Optional[str]):
    return not API_KEY or key == API_KEY


@app.on_event("startup")
def _startup():
    _load_store()


@app.get("/health")
def health():
    return {"ok": True, "enrolled": len(_ids), "threshold": THRESHOLD, "gpu": USE_GPU}


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
    return {"ok": True, "member_id": body.member_id.strip(), "enrolled": len(_ids)}


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
        return f"✅ Enrolled {member_id.strip()} (quality {face['det_score']:.2f}). Total: {len(_ids)}."

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
