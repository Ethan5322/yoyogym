# Hugging Face Space (Docker SDK) / any container host.
FROM python:3.10-slim

# OpenCV / onnxruntime runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libgl1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# InsightFace caches models here; writable for the HF runtime user.
ENV INSIGHTFACE_HOME=/tmp/insightface
ENV FACE_DATA_DIR=/data
ENV PORT=7860
EXPOSE 7860

CMD ["python", "app.py"]
