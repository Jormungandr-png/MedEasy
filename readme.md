# 🩺 MediScribe AI — Ambient Clinical Scribe & Automated SOAP EHR

An end-to-end, zero-cost medical AI web application that listens to doctor–patient conversations, automatically transcribes ambient audio, and generates structured, production-ready clinical **SOAP notes** (Subjective, Objective, Assessment, Plan) with ICD-10 diagnostic codes and prescription details.

---

## 🌟 Key Features

* **🎙️ Ambient Audio & Speech-to-Text:** Live in-browser transcription powered by the Web Speech API and Groq Whisper, distinguishing doctor and patient speaking turns.
* **⚡ Sub-Second Clinical Extraction:** Leverages LPU inference via Groq to extract chief complaints, vitals, ICD-10 diagnoses, and structured drug orders in under one second.
* **📋 Interactive Clinical SOAP Editor:** Doctors can review, edit inline, and verify AI-generated notes before signing off.
* **🔒 Multi-Tenant PostgreSQL Security:** Supabase authentication and PostgreSQL database with Row-Level Security (RLS) guaranteeing strict doctor-patient data isolation.
* **📜 Patient Encounter History:** Stores and displays previous consultation records, signed notes, and historical vitals for longitudinal care.
* **💸 100% Free Production Tier:** Built entirely on generous, perpetual free-tier infrastructure (Render, Vercel, Supabase, Groq).

---

## 🏗️ System Architecture

```
[ Doctor & Patient Voice / Chat ]
               │
               ▼
   [ React (Vite) Frontend ]
   • Web Speech API Audio Stream
   • Real-Time Dialogue Interface
   • Inline SOAP & Rx Editor
               │
               │ HTTP POST /api/encounters/generate-and-save
               ▼
   [ FastAPI Backend (Python) ]
               │
       ┌───────┴────────────────────────┐
       ▼                                ▼
[ Groq Cloud LPU ]             [ Supabase PostgreSQL ]
• Llama / GPT-OSS Models       • Doctor & Patient Tables
• Strict JSON Mode             • Encounter Records & Encrypted JSONB
• ICD-10 & Rx Extraction       • Row-Level Security (RLS)
```

---

## 📊 Database Schema (PostgreSQL on Supabase)

* **`doctors`**: Tracks registered physician accounts, credentials, clinic affiliations, and specialties (linked to Supabase Auth UUID).
* **`patients`**: Stores patient demographics, blood groups, phone numbers, and known drug allergies under their assigned physician.
* **`encounters`**: Persists consultation dialogue transcripts, vitals (`BP`, `HR`, `Temp`, `SpO2`), structured SOAP notes (JSONB), and doctor sign-off verification.

---

## 🚀 Tech Stack

| Layer | Technology | Hosting / Provider |
|---|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, Lucide Icons | Vercel |
| **Backend API** | FastAPI, Uvicorn, Pydantic v2 | Render |
| **Database & Auth** | PostgreSQL, Row-Level Security, Supabase Auth | Supabase |
| **Clinical LLM** | `openai/gpt-oss-120b` / `llama-3.1-8b-instant` | Groq Cloud |
| **Speech-to-Text** | Web Speech API / Groq Whisper | Client & Groq |

---

## 🛠️ Local Development Setup

### 1. Prerequisites
* **Python 3.10+**
* **Node.js 18+ & npm**
* Free API keys from [Supabase](https://supabase.com) and [Groq Console](https://console.groq.com)

---

### 2. Backend Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/mediscribe.git
   cd mediscribe/backend
   ```

2. **Create a virtual environment and install dependencies:**
   ```bash
   python -m venv venv
   source venv/bin/activate    # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure environment variables:**
   Create a `.env` file inside `backend/`:
   ```env
   SUPABASE_URL="https://your-project.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-secret"
   GROQ_API_KEY="gsk_your_groq_api_key"
   ```

4. **Start the FastAPI server:**
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   Interactive Swagger API docs will be available at `http://localhost:8000/docs`.

---

### 3. Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd ../frontend
   npm install
   ```

2. **Configure frontend environment variables:**
   Create a `.env` file inside `frontend/`:
   ```env
   VITE_SUPABASE_URL="https://your-project.supabase.co"
   VITE_SUPABASE_ANON_KEY="your-supabase-publishable-anon-key"
   VITE_API_BASE_URL="http://localhost:8000/api"
   ```

3. **Start the Vite development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

## 🌐 Free Production Deployment

### Backend (Render.com)
1. Link your GitHub repository to **Render** as a new **Web Service**.
2. Set Root Directory to `backend`.
3. Set Build Command to `pip install -r requirements.txt`.
4. Set Start Command to `uvicorn main:app --host 0.0.0.0 --port $PORT`.
5. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GROQ_API_KEY` under Environment Variables.

### Frontend (Vercel.com)
1. Import your GitHub repository into **Vercel**.
2. Set Root Directory to `frontend`.
3. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and set `VITE_API_BASE_URL` to your Render API URL (e.g., `https://mediscribe-api.onrender.com/api`).
4. Click **Deploy**.

---

## 🔒 Security & Medical Compliance

* **Data Isolation:** Enforced via PostgreSQL Row-Level Security (RLS) policies ensuring physicians can only query their own patient records.
* **Human-in-the-Loop:** AI-generated notes are saved in draft status until the physician reviews, modifies, and signs the record.
* **Disclaimer:** Generated notes and ICD-10 suggestions are intended solely to assist clinical documentation workflows and should always be verified by a licensed healthcare professional.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](https://www.google.com/search?q=LICENSE) file for details.
