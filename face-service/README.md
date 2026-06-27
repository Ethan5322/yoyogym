---
title: Yoyo GYM Face Service
emoji: 🛡️
colorFrom: red
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Yoyo GYM — Face Recognition Service

Corporate-grade face recognition using **InsightFace `buffalo_l`**
(**RetinaFace** detection + **ArcFace** 512-D embeddings) — far more accurate
than the in-browser `face-api.js` engine.

- REST JSON API for the gym app to call
- A mobile-friendly **webcam UI at `/ui`** (enrol + verify)
- Cosine-similarity matching on L2-normalised embeddings

## Endpoints

| Method | Path       | Body                                   | Returns |
|--------|------------|----------------------------------------|---------|
| GET    | `/health`  | —                                      | status + enrolled count |
| POST   | `/embed`   | `{ image }`                            | `{ ok, embedding[512], det_score }` |
| POST   | `/enroll`  | `{ member_id, image }`                 | `{ ok, member_id, enrolled }` |
| POST   | `/verify`  | `{ image }`                            | `{ ok, match, member_id, similarity }` |
| POST   | `/compare` | `{ image_a, image_b }`                 | `{ ok, similarity, same_person }` |
| GET    | `/ui`      | —                                      | Gradio webcam UI |

`image` is a data-URL or raw base64 JPEG/PNG. If `FACE_API_KEY` is set, include
`api_key` in every request body.

## Environment variables

| Var | Default | Meaning |
|-----|---------|---------|
| `FACE_THRESHOLD` | `0.45` | cosine similarity required for a match |
| `FACE_MARGIN` | `0.04` | best match must beat the runner-up by this |
| `FACE_API_KEY` | (none) | shared secret; if set, callers must send `api_key` |
| `FACE_DATA_DIR` | `/data` or `.` | where `faces.json` is stored |
| `FACE_USE_GPU` | (off) | set `1` on a CUDA box |
| `PORT` | `7860` | listen port |

## Run locally

```bash
cd face-service
python -m venv .venv && . .venv/Scripts/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py                  # http://localhost:7860/ui  and  /health
```

First run downloads the `buffalo_l` models (~300 MB) automatically.

> Windows note: if `insightface` fails to build, install **Microsoft C++ Build
> Tools** (Desktop development with C++) first, or just deploy via Docker/HF
> (no local compiler needed).

### Expose to phones with ngrok (local option)

```bash
ngrok http 7860
# use the https URL it prints as your FACE_SERVICE_URL
```

## Deploy free on Hugging Face Spaces

1. Create a new Space → **SDK: Docker**.
2. Upload this folder's files (`app.py`, `requirements.txt`, `Dockerfile`,
   this `README.md` — the front-matter above configures the Space).
3. (Optional) Space → Settings → **Variables**: set `FACE_API_KEY`, and add
   **persistent storage** so `/data/faces.json` survives restarts.
4. Your service is at `https://<user>-<space>.hf.space` → API + `/ui`.

## Integrating with the gym app

Two clean options:

- **Embedder mode (recommended for the gym app):** call `/embed` from the
  browser, send the 512-D vector to the Node backend, store it in Supabase and
  do the cosine match there (keeps members in one database). 512-D ArcFace
  vectors are not comparable to the old 128-D face-api vectors, so use a new
  column and have members re-enrol once.
- **Standalone mode:** use `/enroll` + `/verify` (this service keeps its own
  `faces.json`). Great for a dedicated door/reception kiosk via `/ui`.
