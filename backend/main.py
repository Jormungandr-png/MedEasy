from db import supabase
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from llm_service import extract_soap_from_transcript
from schemas import PatientCreate, GenerateSOAPRequest, EncounterUpdate

app = FastAPI(title="MedEasy Production API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",
        "*"                       # Open for dev; restrict to your Vercel domain in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {
        "message": "MedEasy Clinical AI API is running",
        "docs_url": "http://localhost:8000/docs"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "MedEasy Backend"}

# --- Patients Endpoints ---
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
        response = supabase.table("patients").select("*").eq("doctor_id", doctor_id).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- SOAP Generation & Encounter Storage ---
@app.post("/api/encounters/generate-and-save")
def generate_and_save_encounter(req: GenerateSOAPRequest):
    try:
        # 1. Run LLM clinical extraction
        soap_note = extract_soap_from_transcript(req.transcript, req.vitals)

        # 2. Persist record to Supabase
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


@app.get("/api/patients/{patient_id}/encounters")
def get_patient_encounters(patient_id: str):
    try:
        response = (
            supabase.table("encounters")
            .select("id, visit_date, chief_complaint, assessment, plan, doctor_signed")
            .eq("patient_id", patient_id)
            .order("visit_date", desc=True)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/api/encounters/{encounter_id}")
def update_and_sign_encounter(encounter_id: str, payload: EncounterUpdate):
    try:
        # Filter out fields that weren't supplied in the request
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


