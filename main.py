"""FastAPI wrapper. Run with:  uvicorn main:app --reload --port 8000

requirements.txt:
    fastapi
    uvicorn[standard]
    python-multipart
    pymupdf
    opencv-python-headless
    pytesseract
    numpy
    rapidfuzz
    anthropic

System package (Colab / Codespaces / Render):  apt-get install -y tesseract-ocr
Env var for the LLM fallback:                  ANTHROPIC_API_KEY=...
"""
import os
import shutil
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from pipeline import extract_metrics

app = FastAPI(title="MedReport Scanner")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

ALLOWED = (".pdf", ".png", ".jpg", ".jpeg")


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "")[1].lower()
    if suffix not in ALLOWED:
        raise HTTPException(400, f"Unsupported file type. Use one of {ALLOWED}")
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        path = tmp.name
    try:
        # Return for the user to REVIEW before saving to the dashboard DB.
        return extract_metrics(path)
    finally:
        os.remove(path)


@app.get("/health")
def health():
    return {"status": "ok"}
