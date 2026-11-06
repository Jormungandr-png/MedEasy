from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from db import supabase
from schemas import (
    DoctorProfileCreate,
    PatientCreate,
    GenerateSOAPRequest,
    EncounterUpdate
)
from llm_service import extract_soap_from_transcript

app = FastAPI(title="MediScribe Production API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "MediScribe Clinical AI API is running", "docs": "/docs"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

# --- 1. Doctor Profile Sync (Upsert on Login/Signup) ---
@app.post("/api/doctors/sync")
def sync_doctor_profile(doctor: DoctorProfileCreate):
    try:
        response = (
            supabase.table("doctors")
            .upsert(doctor.model_dump(), on_conflict="id")
            .execute()
        )
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/doctors/{doctor_id}")
def get_doctor_profile(doctor_id: str):
    try:
        response = supabase.table("doctors").select("*").eq("id", doctor_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Doctor profile not found")
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- 2. Patients Endpoints ---
@app.post("/api/patients")
def create_patient(patient: PatientCreate):
    try:
        response = supabase.table("patients").insert(patient.model_dump()).execute()
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/patients/{doctor_id}")
def get_patients_by_doctor(doctor_id: str):
    try:
        response = (
            supabase.table("patients")
            .select("*")
            .eq("doctor_id", doctor_id)
            .order("created_at", desc=True)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- 3. SOAP Generation & Encounter Storage ---
@app.post("/api/encounters/generate-and-save")
def generate_and_save_encounter(req: GenerateSOAPRequest):
    try:
        soap_note = extract_soap_from_transcript(req.transcript, req.vitals)

        encounter_payload = {
            "doctor_id": req.doctor_id,
            "patient_id": req.patient_id,
            "dialogue_transcript": [{"raw": req.transcript}],
            "vitals": req.vitals,
            "chief_complaint": soap_note.chiefComplaint,
            "subjective": soap_note.subjective,
            "objective": soap_note.objective,
            "assessment": [item.model_dump() for item in soap_note.assessment],
            "plan": soap_note.plan.model_dump(),
            "doctor_signed": False
        }

        db_record = supabase.table("encounters").insert(encounter_payload).execute()

        return {
            "status": "success",
            "encounter_id": db_record.data[0]["id"],
            "soap": soap_note
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- 4. Fetch Patient Encounters History ---
@app.get("/api/patients/{patient_id}/encounters")
def get_patient_encounters(patient_id: str):
    try:
        response = (
            supabase.table("encounters")
            .select("id, visit_date, chief_complaint, subjective, objective, assessment, plan, vitals, doctor_signed")
            .eq("patient_id", patient_id)
            .order("visit_date", desc=True)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- 5. Doctor Review & Sign Off ---
@app.patch("/api/encounters/{encounter_id}")
def update_and_sign_encounter(encounter_id: str, payload: EncounterUpdate):
    try:
        update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
        response = (
            supabase.table("encounters")
            .update(update_data)
            .eq("id", encounter_id)
            .execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Encounter record not found.")
        return {"status": "success", "updated_record": response.data[0]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))