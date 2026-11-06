import React, { useState, useEffect, useRef } from 'react';
import { supabase, API_BASE } from './supabaseClient';
import {
  Mic,
  MicOff,
  Send,
  Sparkles,
  Stethoscope,
  Activity,
  Pill,
  Copy,
  Check,
  Plus,
  RefreshCw,
  User,
  Trash2,
  Save,
  CheckCircle2,
  LogOut,
  History,
  UserPlus,
  X,
  Lock,
  Mail,
  Building2,
  Award
} from 'lucide-react';

export default function App() {
  // --- Auth & Doctor State ---
  const [session, setSession] = useState(null);
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'
  const [authLoading, setAuthLoading] = useState(false);
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    full_name: '',
    specialty: 'General Medicine',
    clinic_name: 'Lifecare Clinic',
    medical_license_number: ''
  });

  // --- Patient & History State ---
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [pastEncounters, setPastEncounters] = useState([]);
  const [showNewPatientModal, setShowNewPatientModal] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [newPatientForm, setNewPatientForm] = useState({
    full_name: '',
    age: '',
    gender: 'Male',
    phone: '',
    blood_group: 'O+',
    allergies: ''
  });

  // --- Consultation & SOAP State ---
  const [turns, setTurns] = useState([]);
  const [activeSpeaker, setActiveSpeaker] = useState('Patient');
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [vitals, setVitals] = useState({
    bp: '120/80 mmHg',
    hr: '76 bpm',
    temp: '98.4 F',
    spo2: '99%'
  });

  const [soapNote, setSoapNote] = useState(null);
  const [currentEncounterId, setCurrentEncounterId] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(null);

  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // --- 1. Check Active Supabase Auth Session ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        ensureDoctorProfile(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        ensureDoctorProfile(session.user);
      } else {
        setDoctorProfile(null);
        setPatients([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Ensure doctor row exists in PostgreSQL `doctors` table
  const ensureDoctorProfile = async (user, extraMeta = {}) => {
    try {
      const payload = {
        id: user.id,
        full_name: extraMeta.full_name || user.user_metadata?.full_name || user.email.split('@')[0],
        specialty: extraMeta.specialty || user.user_metadata?.specialty || 'General Physician',
        clinic_name: extraMeta.clinic_name || user.user_metadata?.clinic_name || 'MediScribe Clinic',
        medical_license_number: extraMeta.medical_license_number || user.user_metadata?.medical_license_number || 'VERIFIED'
      };

      const res = await fetch(`${API_BASE}/doctors/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const profile = await res.json();
        setDoctorProfile(profile);
        loadPatients(user.id);
      }
    } catch (err) {
      showToast('Backend connection error. Check if FastAPI is running on port 8000.');
    }
  };

  // --- 2. Handle Login / Signup ---
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: authForm.email,
          password: authForm.password,
          options: {
            data: {
              full_name: authForm.full_name,
              specialty: authForm.specialty,
              clinic_name: authForm.clinic_name,
              medical_license_number: authForm.medical_license_number
            }
          }
        });
        if (error) throw error;
        if (data?.user) {
          await ensureDoctorProfile(data.user, authForm);
          showToast('Doctor account created and signed in!');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authForm.email,
          password: authForm.password
        });
        if (error) throw error;
        if (data?.user) {
          await ensureDoctorProfile(data.user);
          showToast('Welcome back, Doctor!');
        }
      }
    } catch (err) {
      showToast(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setTurns([]);
    setSoapNote(null);
    showToast('Signed out successfully');
  };

  // --- 3. Load Patients & Patient Encounter History ---
  const loadPatients = async (doctorId) => {
    try {
      const res = await fetch(`${API_BASE}/patients/${doctorId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setPatients(data);
        if (data.length > 0 && !selectedPatientId) {
          setSelectedPatientId(data[0].id);
        }
      }
    } catch {
      showToast('Could not fetch patients list.');
    }
  };

  const loadPatientHistory = async (patientId) => {
    if (!patientId) return;
    try {
      const res = await fetch(`${API_BASE}/patients/${patientId}/encounters`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setPastEncounters(data);
      }
    } catch {
      setPastEncounters([]);
    }
  };

  useEffect(() => {
    if (selectedPatientId) {
      loadPatientHistory(selectedPatientId);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  // --- 4. Create New Patient ---
  const handleCreatePatient = async (e) => {
    e.preventDefault();
    if (!session?.user) return;

    try {
      const payload = {
        doctor_id: session.user.id,
        full_name: newPatientForm.full_name,
        age: parseInt(newPatientForm.age, 10) || 30,
        gender: newPatientForm.gender,
        phone: newPatientForm.phone,
        blood_group: newPatientForm.blood_group,
        allergies: newPatientForm.allergies
          ? newPatientForm.allergies.split(',').map(a => a.trim()).filter(Boolean)
          : []
      };

      const res = await fetch(`${API_BASE}/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const created = await res.json();
        setPatients(prev => [created, ...prev]);
        setSelectedPatientId(created.id);
        setShowNewPatientModal(false);
        setNewPatientForm({ full_name: '', age: '', gender: 'Male', phone: '', blood_group: 'O+', allergies: '' });
        showToast(`Patient ${created.full_name} added!`);
      } else {
        const err = await res.json();
        showToast(`Failed: ${err.detail}`);
      }
    } catch {
      showToast('Error creating patient.');
    }
  };

  // --- 5. Voice Dictation (Web Speech API) ---
  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      showToast('Microphone paused.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Browser speech recognition requires Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInputText(prev => (prev ? `${prev} ${transcript}` : transcript));
    };

    recognition.onerror = () => setIsRecording(false);
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
    showToast(`Listening to ${activeSpeaker}...`);
  };

  const handleSendTurn = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newTurn = {
      speaker: activeSpeaker,
      text: inputText.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setTurns(prev => [...prev, newTurn]);
    setInputText('');
    setActiveSpeaker(prev => (prev === 'Doctor' ? 'Patient' : 'Doctor'));
  };

  // --- 6. Generate SOAP & Save to Supabase ---
  const handleGenerateSOAP = async () => {
    if (turns.length === 0) {
      showToast('Record or type dialogue turns before generating SOAP.');
      return;
    }
    if (!selectedPatientId) {
      showToast('Please select or add a patient first.');
      return;
    }

    setIsGenerating(true);
    const transcriptText = turns.map(t => `${t.speaker}: ${t.text}`).join('\n');

    try {
      const res = await fetch(`${API_BASE}/encounters/generate-and-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: session.user.id,
          patient_id: selectedPatientId,
          transcript: transcriptText,
          vitals: vitals
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSoapNote(data.soap);
        setCurrentEncounterId(data.encounter_id);
        setIsSigned(false);
        loadPatientHistory(selectedPatientId);
        showToast('SOAP Note generated & stored in Supabase!');
      } else {
        showToast(`Error: ${data.detail || 'Generation failed'}`);
      }
    } catch (err) {
      showToast(`Network error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- 7. Doctor Edit & Sign Off ---
  const handleSignNote = async () => {
    if (!currentEncounterId || !soapNote) return;

    try {
      const res = await fetch(`${API_BASE}/encounters/${currentEncounterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chief_complaint: soapNote.chiefComplaint,
          subjective: soapNote.subjective,
          objective: soapNote.objective,
          assessment: soapNote.assessment,
          plan: soapNote.plan,
          doctor_signed: true
        })
      });

      if (res.ok) {
        setIsSigned(true);
        loadPatientHistory(selectedPatientId);
        showToast('SOAP Note verified, updated & signed by Doctor!');
      }
    } catch {
      showToast('Failed to sign encounter.');
    }
  };

  const handleCopySOAP = () => {
    if (!soapNote) return;
    const text = `CHIEF COMPLAINT: ${soapNote.chiefComplaint}\n\nSUBJECTIVE:\n${soapNote.subjective}\n\nOBJECTIVE:\n${soapNote.objective}\n\nASSESSMENT:\n${soapNote.assessment.map(a => `- [${a.code}] ${a.condition}`).join('\n')}\n\nPLAN:\n${soapNote.plan.medications.map(m => `- ${m.name} ${m.dosage} (${m.frequency} for ${m.duration})`).join('\n')}\nFollow-Up: ${soapNote.plan.followUp}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Formatted SOAP Note copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // ============================================================================
  // VIEW 1: AUTHENTICATION SCREEN (IF NOT LOGGED IN)
  // ============================================================================
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        {toast && (
          <div className="fixed top-5 right-5 z-50 bg-teal-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-medium">
            <Sparkles className="w-4 h-4" />
            {toast}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-8 space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-teal-600 flex items-center justify-center text-white shadow-md mb-3">
              <Stethoscope className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">MediScribe AI</h1>
            <p className="text-xs text-slate-500 mt-1">
              Ambient Clinical Scribe & Automated SOAP EHR Portal
            </p>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                authMode === 'login' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600'
              }`}
            >
              Doctor Sign In
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('signup')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                authMode === 'signup' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600'
              }`}
            >
              New Doctor Registration
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Doctor Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="Dr. Aditi Sharma"
                      value={authForm.full_name}
                      onChange={e => setAuthForm({ ...authForm, full_name: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Specialty</label>
                    <div className="relative">
                      <Award className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="General Medicine"
                        value={authForm.specialty}
                        onChange={e => setAuthForm({ ...authForm, specialty: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Clinic / Hospital</label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Lifecare Clinic"
                        value={authForm.clinic_name}
                        onChange={e => setAuthForm({ ...authForm, clinic_name: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  placeholder="doctor@test.com"
                  value={authForm.email}
                  onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authForm.password}
                  onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 rounded-xl text-xs shadow-sm transition-all disabled:opacity-50"
            >
              {authLoading ? 'Authenticating...' : authMode === 'login' ? 'Sign In to Clinic Portal' : 'Create Doctor Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================================
  // VIEW 2: MAIN DOCTOR WORKSPACE
  // ============================================================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-medium">
          <Sparkles className="w-4 h-4 text-teal-400" />
          {toast}
        </div>
      )}

      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 sticky top-0 z-30 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-sm">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base text-slate-900">MediScribe AI</h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                {doctorProfile?.clinic_name || 'Clinical Portal'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Logged in as <strong>{doctorProfile?.full_name || session.user.email}</strong> ({doctorProfile?.specialty || 'MD'})
            </p>
          </div>
        </div>

        {/* Patient Controls & Sign Out */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            <User className="w-4 h-4 text-teal-600" />
            <select
              value={selectedPatientId}
              onChange={e => {
                setSelectedPatientId(e.target.value);
                setSoapNote(null);
                setTurns([]);
              }}
              className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none min-w-[160px]"
            >
              {patients.length === 0 ? (
                <option value="">No patients yet — Add one</option>
              ) : (
                patients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.age}y / {p.gender})
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            onClick={() => setShowNewPatientModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-xs font-semibold transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            New Patient
          </button>

          <button
            onClick={() => setShowHistoryDrawer(!showHistoryDrawer)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all"
          >
            <History className="w-3.5 h-3.5" />
            Past Visits ({pastEncounters.length})
          </button>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Editable Patient Vitals Bar */}
      <div className="max-w-7xl w-full mx-auto px-4 pt-3">
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">
            Current Encounter Vitals:
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-600">BP:</span>
              <input
                value={vitals.bp}
                onChange={e => setVitals({ ...vitals, bp: e.target.value })}
                className="bg-transparent w-24 text-slate-900 font-medium focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-600">HR:</span>
              <input
                value={vitals.hr}
                onChange={e => setVitals({ ...vitals, hr: e.target.value })}
                className="bg-transparent w-16 text-slate-900 font-medium focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-600">Temp:</span>
              <input
                value={vitals.temp}
                onChange={e => setVitals({ ...vitals, temp: e.target.value })}
                className="bg-transparent w-16 text-slate-900 font-medium focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-600">SpO2:</span>
              <input
                value={vitals.spo2}
                onChange={e => setVitals({ ...vitals, spo2: e.target.value })}
                className="bg-transparent w-12 text-slate-900 font-medium focus:outline-none"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Main Split Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Live Dialogue Stream (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[680px] overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
              <h2 className="font-semibold text-sm text-slate-800">Doctor–Patient Dialogue</h2>
            </div>
            <button
              onClick={() => { setTurns([]); setSoapNote(null); }}
              className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
            {turns.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <Mic className="w-10 h-10 mb-2 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">Ready for Consultation</p>
                <p className="text-xs mt-1 max-w-xs">
                  Select a speaker below and click <strong>Voice Dictate</strong> or type the conversation turns.
                </p>
              </div>
            ) : (
              turns.map((turn, i) => (
                <div key={i} className={`flex flex-col ${turn.speaker === 'Doctor' ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className={`text-[11px] font-bold uppercase ${turn.speaker === 'Doctor' ? 'text-teal-700' : 'text-indigo-600'}`}>
                      {turn.speaker === 'Doctor' ? '🩺 Doctor' : '🧑 Patient'}
                    </span>
                    <span className="text-[10px] text-slate-400">{turn.time}</span>
                  </div>
                  <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                    turn.speaker === 'Doctor'
                      ? 'bg-teal-600 text-white rounded-tr-none'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                  }`}>
                    {turn.text}
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendTurn} className="p-3 bg-white border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveSpeaker('Patient')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    activeSpeaker === 'Patient' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  🧑 Patient
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSpeaker('Doctor')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    activeSpeaker === 'Doctor' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  🩺 Doctor
                </button>
              </div>

              <button
                type="button"
                onClick={toggleRecording}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${
                  isRecording ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {isRecording ? <><MicOff className="w-3.5 h-3.5" /> Stop Mic</> : <><Mic className="w-3.5 h-3.5 text-rose-500" /> Voice Dictate</>}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder={`Type or dictate what the ${activeSpeaker} says...`}
                className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
              />
              <button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white p-2.5 rounded-xl shadow-sm transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Right: Editable SOAP Note Output (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[680px] overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-600" />
              <h2 className="font-semibold text-sm text-slate-800">Automated Clinical SOAP Note</h2>
              {isSigned && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Signed
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateSOAP}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                {isGenerating ? 'Extracting SOAP...' : 'Generate SOAP'}
              </button>

              {soapNote && (
                <>
                  <button
                    onClick={handleCopySOAP}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>

                  <button
                    onClick={handleSignNote}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isSigned ? 'Update Signed Note' : 'Sign & Finalize'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!soapNote ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                <Activity className="w-12 h-12 mb-3 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No SOAP Note Generated Yet</p>
                <p className="text-xs mt-1 max-w-sm">
                  Record the patient consultation on the left, then click <strong>Generate SOAP</strong> to extract structured clinical findings and save to Supabase.
                </p>
              </div>
            ) : (
              <>
                {/* Editable Chief Complaint */}
                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block mb-1">
                    Chief Complaint (CC)
                  </span>
                  <input
                    value={soapNote.chiefComplaint}
                    onChange={e => setSoapNote({ ...soapNote, chiefComplaint: e.target.value })}
                    className="w-full bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
                  />
                </div>

                {/* Editable S - Subjective */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-indigo-50/70 px-3.5 py-2 border-b border-slate-200">
                    <span className="font-bold text-xs text-slate-800">S — Subjective (History of Present Illness)</span>
                  </div>
                  <div className="p-3 bg-white">
                    <textarea
                      rows={3}
                      value={soapNote.subjective}
                      onChange={e => setSoapNote({ ...soapNote, subjective: e.target.value })}
                      className="w-full text-xs text-slate-700 leading-relaxed bg-transparent focus:outline-none resize-none"
                    />
                  </div>
                </div>

                {/* Editable O - Objective */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-sky-50/70 px-3.5 py-2 border-b border-slate-200">
                    <span className="font-bold text-xs text-slate-800">O — Objective (Vitals & Physical Exam)</span>
                  </div>
                  <div className="p-3 bg-white">
                    <textarea
                      rows={3}
                      value={soapNote.objective}
                      onChange={e => setSoapNote({ ...soapNote, objective: e.target.value })}
                      className="w-full text-xs text-slate-700 leading-relaxed bg-transparent focus:outline-none resize-none"
                    />
                  </div>
                </div>

                {/* A - Assessment & ICD-10 */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-emerald-50/70 px-3.5 py-2 border-b border-slate-200">
                    <span className="font-bold text-xs text-slate-800">A — Assessment & ICD-10 Diagnosis</span>
                  </div>
                  <div className="p-3 bg-white space-y-2">
                    {soapNote.assessment.map((a, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono font-bold text-[11px]">
                            {a.code}
                          </span>
                          <input
                            value={a.condition}
                            onChange={e => {
                              const next = [...soapNote.assessment];
                              next[i].condition = e.target.value;
                              setSoapNote({ ...soapNote, assessment: next });
                            }}
                            className="font-medium text-slate-800 bg-transparent flex-1 focus:outline-none"
                          />
                        </div>
                        <span className="text-slate-500 font-medium text-[11px]">{a.confidence}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* P - Plan & Medications */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-purple-50/70 px-3.5 py-2 border-b border-slate-200">
                    <span className="font-bold text-xs text-slate-800">P — Plan (Rx Medications & Follow-Up)</span>
                  </div>
                  <div className="p-3 bg-white space-y-3">
                    <div className="space-y-1.5">
                      {soapNote.plan.medications.map((m, i) => (
                        <div key={i} className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs grid grid-cols-12 gap-2">
                          <input
                            value={m.name}
                            onChange={e => {
                              const meds = [...soapNote.plan.medications];
                              meds[i].name = e.target.value;
                              setSoapNote({ ...soapNote, plan: { ...soapNote.plan, medications: meds } });
                            }}
                            className="col-span-4 font-semibold text-slate-800 bg-transparent focus:outline-none"
                          />
                          <input
                            value={m.dosage}
                            onChange={e => {
                              const meds = [...soapNote.plan.medications];
                              meds[i].dosage = e.target.value;
                              setSoapNote({ ...soapNote, plan: { ...soapNote.plan, medications: meds } });
                            }}
                            className="col-span-2 text-teal-700 font-medium bg-transparent focus:outline-none"
                          />
                          <input
                            value={m.frequency}
                            onChange={e => {
                              const meds = [...soapNote.plan.medications];
                              meds[i].frequency = e.target.value;
                              setSoapNote({ ...soapNote, plan: { ...soapNote.plan, medications: meds } });
                            }}
                            className="col-span-4 text-slate-600 bg-transparent focus:outline-none"
                          />
                          <input
                            value={m.duration}
                            onChange={e => {
                              const meds = [...soapNote.plan.medications];
                              meds[i].duration = e.target.value;
                              setSoapNote({ ...soapNote, plan: { ...soapNote.plan, medications: meds } });
                            }}
                            className="col-span-2 text-right text-slate-500 bg-transparent focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="font-bold text-slate-500 block mb-1">Lifestyle & Advice</span>
                        <ul className="list-disc list-inside text-slate-700 space-y-0.5">
                          {soapNote.plan.lifestyle.map((l, i) => <li key={i}>{l}</li>)}
                        </ul>
                      </div>
                      <div>
                        <span className="font-bold text-slate-500 block mb-1">Follow-Up Instructions</span>
                        <textarea
                          rows={2}
                          value={soapNote.plan.followUp}
                          onChange={e => setSoapNote({ ...soapNote, plan: { ...soapNote.plan, followUp: e.target.value } })}
                          className="w-full text-slate-700 bg-transparent focus:outline-none resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* MODAL: ADD NEW PATIENT */}
      {showNewPatientModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Register New Patient</h3>
              <button onClick={() => setShowNewPatientModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePatient} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                <input
                  required
                  value={newPatientForm.full_name}
                  onChange={e => setNewPatientForm({ ...newPatientForm, full_name: e.target.value })}
                  placeholder="e.g. Neha Kulkarni"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Age *</label>
                  <input
                    type="number"
                    required
                    value={newPatientForm.age}
                    onChange={e => setNewPatientForm({ ...newPatientForm, age: e.target.value })}
                    placeholder="34"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Gender</label>
                  <select
                    value={newPatientForm.gender}
                    onChange={e => setNewPatientForm({ ...newPatientForm, gender: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  >
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Blood Group</label>
                  <input
                    value={newPatientForm.blood_group}
                    onChange={e => setNewPatientForm({ ...newPatientForm, blood_group: e.target.value })}
                    placeholder="O+"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Phone Number</label>
                <input
                  value={newPatientForm.phone}
                  onChange={e => setNewPatientForm({ ...newPatientForm, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Known Allergies (comma separated)</label>
                <input
                  value={newPatientForm.allergies}
                  onChange={e => setNewPatientForm({ ...newPatientForm, allergies: e.target.value })}
                  placeholder="Penicillin, Sulfa, Dust"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewPatientModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700"
                >
                  Save Patient
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SLIDE-OVER DRAWER: PAST PATIENT ENCOUNTERS */}
      {showHistoryDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex justify-end">
          <div className="bg-white w-full max-w-md h-full shadow-2xl p-6 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-teal-600" />
                Past Clinical Encounters
              </h3>
              <button onClick={() => setShowHistoryDrawer(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {pastEncounters.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No previous visits recorded for this patient.</p>
              ) : (
                pastEncounters.map(enc => (
                  <div
                    key={enc.id}
                    onClick={() => {
                      setSoapNote({
                        chiefComplaint: enc.chief_complaint,
                        subjective: enc.subjective || '',
                        objective: enc.objective || '',
                        assessment: enc.assessment || [],
                        plan: enc.plan || { medications: [], diagnostics: [], lifestyle: [], followUp: '' }
                      });
                      setCurrentEncounterId(enc.id);
                      setIsSigned(enc.doctor_signed);
                      setShowHistoryDrawer(false);
                      showToast('Loaded historical encounter into SOAP viewer');
                    }}
                    className="p-3.5 rounded-xl border border-slate-200 hover:border-teal-500 cursor-pointer transition-all bg-slate-50/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-700">
                        {new Date(enc.visit_date).toLocaleDateString()} — {new Date(enc.visit_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${
                        enc.doctor_signed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {enc.doctor_signed ? 'Signed' : 'Draft'}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-900 line-clamp-2">{enc.chief_complaint}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}