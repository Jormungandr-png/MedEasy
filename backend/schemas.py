from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

# --- Patient Schemas ---
class PatientCreate(BaseModel):
    doctor_id: str
    full_name: str
    age: int
    gender: str
    phone: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: List[str] = []

class PatientResponse(PatientCreate):
    id: str
    created_at: str

# --- Clinical SOAP Schemas ---
class MedicationOrder(BaseModel):
    name: str = Field(description="Generic or brand drug name")
    dosage: str = Field(description="Strength, e.g., 500mg, 10ml")
    frequency: str = Field(description="Schedule, e.g., Twice daily after meals (BD)")
    duration: str = Field(description="Course duration, e.g., 5 days")

class DiagnosisItem(BaseModel):
    code: str = Field(description="Standard ICD-10 code, e.g., G43.109")
    condition: str = Field(description="Condition description")
    confidence: str = Field(description="High, Secondary, or Provisional")

class SOAPPlan(BaseModel):
    medications: List[MedicationOrder] = Field(default_factory=list)
    diagnostics: List[str] = Field(default_factory=list)
    lifestyle: List[str] = Field(default_factory=list)
    followUp: str = Field(description="Follow-up timeframe and emergency warning signs")

class SOAPNoteSchema(BaseModel):
    chiefComplaint: str
    subjective: str = Field(description="Patient reported history, symptom onset, severity, and timeline")
    objective: str = Field(description="Physical exam findings, vital signs, and observed clinical signs")
    assessment: List[DiagnosisItem]
    plan: SOAPPlan

# --- Encounter Request ---
class GenerateSOAPRequest(BaseModel):
    doctor_id: str
    patient_id: str
    transcript: str
    vitals: Optional[Dict[str, Any]] = {"bp": "", "hr": "", "temp": "", "spo2": ""}


# --- Encounter Update Schema ---
class EncounterUpdate(BaseModel):
    chief_complaint: Optional[str] = None
    subjective: Optional[str] = None
    objective: Optional[str] = None
    assessment: Optional[list] = None
    plan: Optional[dict] = None
    doctor_signed: Optional[bool] = True