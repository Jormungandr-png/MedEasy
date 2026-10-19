"""Medical report pipeline: PDF/image -> text (OCR) -> structured metrics.

Stages:
  1. extract_text()    - uses the PDF text layer if present, else OCR (Tesseract)
  2. rule_parse()      - regex + fuzzy matching for clean "Test  Value  Unit  Range" lines
  3. llm_parse()       - LLM fallback for lines the rules could not parse
  4. extract_metrics() - ties it all together and flags out-of-range values

Use DUMMY reports while developing. Do not send real patient data to any API
unless you have checked its data-retention policy.
"""
import json
import os
import re

import cv2
import fitz  # PyMuPDF (no poppler needed, low RAM)
import numpy as np
import pytesseract
from rapidfuzz import fuzz, process

# ---------------------------------------------------------------- name normalization
# Extend this table as you see more reports. Key = standard name.
ALIASES = {
    "Hemoglobin": ["hemoglobin", "haemoglobin", "hb", "hgb"],
    "WBC": ["wbc", "total leucocyte count", "total wbc count", "tlc", "white blood cells"],
    "RBC": ["rbc", "total rbc count", "red blood cells"],
    "Platelets": ["platelets", "platelet count", "plt"],
    "Glucose (Fasting)": ["fasting blood sugar", "fasting glucose", "fbs", "glucose fasting"],
    "HbA1c": ["hba1c", "glycosylated hemoglobin", "glycated hemoglobin"],
    "Total Cholesterol": ["total cholesterol", "cholesterol total", "cholesterol"],
    "HDL": ["hdl", "hdl cholesterol"],
    "LDL": ["ldl", "ldl cholesterol"],
    "Triglycerides": ["triglycerides", "tg"],
    "Creatinine": ["creatinine", "serum creatinine"],
    "TSH": ["tsh", "thyroid stimulating hormone"],
    "Vitamin D": ["vitamin d", "25-oh vitamin d", "vitamin d total"],
    "Vitamin B12": ["vitamin b12", "vit b12", "cyanocobalamin"],
}
_LOOKUP = {alias: std for std, names in ALIASES.items() for alias in names}


def normalize_name(raw: str):
    """Map a raw test name to a standard name, or None if no confident match."""
    raw = re.sub(r"[^a-z0-9 ()/-]", "", raw.lower()).strip()
    match = process.extractOne(raw, _LOOKUP.keys(), scorer=fuzz.token_sort_ratio, score_cutoff=85)
    return _LOOKUP[match[0]] if match else None


# ---------------------------------------------------------------- OCR
def preprocess(img: np.ndarray) -> np.ndarray:
    """Grayscale -> denoise -> adaptive threshold. Helps Tesseract on scans/photos."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    gray = cv2.fastNlMeansDenoising(gray, h=15)
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15
    )


def ocr_image(img: np.ndarray) -> str:
    # psm 6 = assume a uniform block of text; works well for lab-report rows
    return pytesseract.image_to_string(preprocess(img), config="--oem 3 --psm 6")


def extract_text(path: str) -> str:
    """Return text from a PDF (text layer or OCR) or an image file."""
    if path.lower().endswith(".pdf"):
        pages = []
        with fitz.open(path) as doc:
            for page in doc:
                text = page.get_text()
                if len(text.strip()) < 50:  # scanned page -> render and OCR
                    pix = page.get_pixmap(dpi=200)
                    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
                        pix.height, pix.width, pix.n
                    )
                    img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR) if pix.n >= 3 else img
                    text = ocr_image(img)
                pages.append(text)
        return "\n".join(pages)
    img = cv2.imread(path)
    if img is None:
        raise ValueError(f"Could not read image: {path}")
    return ocr_image(img)


# ---------------------------------------------------------------- rule-based parsing
# Matches e.g.  "Hemoglobin   13.2   g/dL   12.0 - 16.0"
LINE_RE = re.compile(
    r"^(?P<name>[A-Za-z][A-Za-z0-9 .()/%-]{1,40}?)\s+"
    r"(?P<value>\d+(?:\.\d+)?)\s*"
    r"(?P<unit>\S+)?\s+"
    r"(?P<lo>\d+(?:\.\d+)?)\s*[-\u2013]\s*(?P<hi>\d+(?:\.\d+)?)"
)


def flag(value, lo, hi):
    if lo is None or hi is None:
        return "unknown"
    return "low" if value < lo else "high" if value > hi else "normal"


def rule_parse(text: str):
    """Return (metrics, leftover_lines). Leftovers are candidates for the LLM."""
    metrics, leftovers = [], []
    for line in (l.strip() for l in text.splitlines()):
        if not line or not any(c.isdigit() for c in line):
            continue
        m = LINE_RE.match(line)
        std = normalize_name(m["name"]) if m else None
        if m and std:
            v, lo, hi = float(m["value"]), float(m["lo"]), float(m["hi"])
            metrics.append(
                {"test": std, "value": v, "unit": m["unit"] or "", "ref_low": lo,
                 "ref_high": hi, "flag": flag(v, lo, hi), "source": "rules"}
            )
        else:
            leftovers.append(line)
    return metrics, leftovers


# ---------------------------------------------------------------- LLM fallback
LLM_PROMPT = """You extract lab results from OCR text of a medical report.
Return ONLY a JSON array, no prose, no code fences. Each item:
{{"test": str, "value": number, "unit": str, "ref_low": number|null, "ref_high": number|null}}
Skip anything that is not a lab test result (addresses, doctor names, dates, headers).
Do not invent values; if a field is missing use null.

OCR text:
{text}"""


def llm_parse(lines):
    """Parse leftover lines with an LLM. Returns [] if no API key is set."""
    if not lines or not os.getenv("ANTHROPIC_API_KEY"):
        return []
    import anthropic  # imported lazily so the rest works without it

    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=os.getenv("LLM_MODEL", "claude-haiku-5-5"),
        max_tokens=2000,
        messages=[{"role": "user", "content": LLM_PROMPT.format(text="\n".join(lines))}],
    )
    raw = resp.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.M).strip()
    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        return []
    out = []
    for it in items:
        std = normalize_name(str(it.get("test", ""))) or str(it.get("test", "")).strip()
        try:
            v = float(it["value"])
        except (KeyError, TypeError, ValueError):
            continue
        lo, hi = it.get("ref_low"), it.get("ref_high")
        out.append(
            {"test": std, "value": v, "unit": it.get("unit") or "", "ref_low": lo,
             "ref_high": hi, "flag": flag(v, lo, hi), "source": "llm"}
        )
    return out


# ---------------------------------------------------------------- public entry point
def extract_metrics(path: str):
    text = extract_text(path)
    metrics, leftovers = rule_parse(text)
    metrics += llm_parse(leftovers)
    return {"raw_text": text, "metrics": metrics}


if __name__ == "__main__":
    import sys

    result = extract_metrics(sys.argv[1])
    print(json.dumps(result["metrics"], indent=2))
