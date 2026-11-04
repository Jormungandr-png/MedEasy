import os
import json
from dotenv import load_dotenv
from groq import Groq
from schemas import SOAPNoteSchema

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("Missing GROQ_API_KEY in .env file.")

client = Groq(api_key=GROQ_API_KEY)

SYSTEM_PROMPT = """You are a certified clinical scribe and medical documentation expert.
Analyze the provided transcript of a doctor-patient encounter and generate a precise, professional SOAP note in valid JSON format.

JSON Schema to follow strictly:
{
  "chiefComplaint": "string",
  "subjective": "string (patient reported history, symptom onset, severity, and timeline)",
  "objective": "string (physical exam findings, vital signs, and observed clinical signs)",
  "assessment": [
    {
      "code": "ICD-10 code (e.g. G43.109)",
      "condition": "Condition name",
      "confidence": "High, Secondary, or Provisional"
    }
  ],
  "plan": {
    "medications": [
      {
        "name": "Drug name",
        "dosage": "Strength (e.g. 500mg)",
        "frequency": "Frequency (e.g. Twice daily after meals)",
        "duration": "Duration (e.g. 3 days)"
      }
    ],
    "diagnostics": ["List of tests or 'None indicated'"],
    "lifestyle": ["Diet, rest, precautions"],
    "followUp": "Follow-up timeframe and emergency warning signs"
  }
}

Rules:
1. Output ONLY valid JSON matching the schema above. Do not wrap in markdown quotes or preamble.
2. Do not invent details not mentioned in the transcript. Write 'Not documented' if a section is absent."""

def extract_soap_from_transcript(transcript: str, vitals: dict = None) -> SOAPNoteSchema:
    prompt = f"Transcript:\n{transcript}\n"
    if vitals:
        prompt += f"\nRecorded Vitals: BP: {vitals.get('bp')}, HR: {vitals.get('hr')}, Temp: {vitals.get('temp')}, SpO2: {vitals.get('spo2')}"

    chat_completion = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        temperature=0.1,
        response_format={"type": "json_object"}
    )

    raw_json = chat_completion.choices[0].message.content
    parsed_dict = json.loads(raw_json)
    
    # Validates and parses directly into our Pydantic schema
    return SOAPNoteSchema(**parsed_dict)