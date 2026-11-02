import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Home as HomeIcon,
  Users,
  MapPin,
  PhoneCall,
  Pill,
  HeartPulse,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Volume2,
  Plus,
  Trash2,
  Upload,
  Mic,
  Square,
  Play,
  Pause,
  RefreshCw,
  Share2,
  Camera,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { speak, cancelSpeech } from '../utils/voice';

const RELATIONSHIP_OPTIONS = [
  { value: 'son', labelKey: 'relationships.son', defaultLabel: 'Son (बेटा)' },
  { value: 'daughter', labelKey: 'relationships.daughter', defaultLabel: 'Daughter (बेटी)' },
  { value: 'grandson', labelKey: 'relationships.grandson', defaultLabel: 'Grandson (पोता / नाती)' },
  { value: 'granddaughter', labelKey: 'relationships.granddaughter', defaultLabel: 'Granddaughter (पोती / नातिनी)' },
  { value: 'wife', labelKey: 'relationships.wife', defaultLabel: 'Wife (पत्नी)' },
  { value: 'husband', labelKey: 'relationships.husband', defaultLabel: 'Husband (पति)' },
  { value: 'brother', labelKey: 'relationships.brother', defaultLabel: 'Brother (भाई)' },
  { value: 'sister', labelKey: 'relationships.sister', defaultLabel: 'Sister (बहन)' },
  { value: 'other', labelKey: 'relationships.other', defaultLabel: 'Other Family Member (अन्य परिजन)' },
];

export default function Wizard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { elder: authElder, updateElder } = useAuth();

  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Step 1: Elder Details
  const [elder, setElder] = useState({
    name: 'Ramesh',
    age: '74',
    language: 'hi',
    region: 'Assam',
    voiceSpeed: '0.65',
    photoBase64: null,
  });

  // Step 2: Safe Home
  const [homePlace, setHomePlace] = useState({
    name: 'Home',
    address: 'Uzan Bazar, Guwahati, Assam',
    latitude: '26.1865',
    longitude: '91.7541',
  });
  const [locating, setLocating] = useState(false);

  // Step 3: Family Members
  const [familyList, setFamilyList] = useState([]);
  const [newFamily, setNewFamily] = useState({
    name: '',
    relationship: 'son',
    phone: '',
    isEmergencyContact: true,
    emergencyPriority: 1,
    photoBase64: null,
    voiceBase64: null,
  });

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const audioPlayerRef = useRef(null);

  const [uploadLink, setUploadLink] = useState(null);

  // Step 4: Medicines
  const [medicinesList, setMedicinesList] = useState([]);
  const [newMedicine, setNewMedicine] = useState({
    name: '',
    dose: '1 tablet',
    shapeColor: 'round-white',
    timesPerDay: ['08:00', '20:00'],
    beforeAfterFood: 'after',
    notes: 'Take with warm water',
  });

  // Step 5: Emergency & Consent
  const [health, setHealth] = useState({
    bloodGroup: 'B+',
    allergies: 'None',
    doctorName: 'Dr. B. K. Sarma',
    doctorPhone: '+91 98765 43210',
    conditions: 'Mild Memory Loss',
  });
  const [consent, setConsent] = useState({
    shareLocation: true,
    shareHealth: true,
    shareProgress: true,
  });

  // Fetch initial wizard state
  useEffect(() => {
    fetch('/api/wizard/state', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          if (data.elder) {
            setElder({
              name: data.elder.name || 'Ramesh',
              age: String(data.elder.age || '74'),
              language: data.elder.language || 'hi',
              region: data.elder.region || 'Assam',
              voiceSpeed: String(data.elder.voice_speed || '0.65'),
              photoBase64: null,
            });
          }
          if (data.places && data.places.length > 0) {
            const hp = data.places.find((p) => p.place_type === 'home');
            if (hp) {
              setHomePlace({
                name: hp.name,
                address: hp.address,
                latitude: String(hp.latitude),
                longitude: String(hp.longitude),
              });
            }
          }
          if (data.family && data.family.length > 0) {
            setFamilyList(data.family);
          }
          if (data.medicines && data.medicines.length > 0) {
            setMedicinesList(data.medicines);
          }
          if (data.health) {
            setHealth({
              bloodGroup: data.health.bloodGroup || 'B+',
              allergies: data.health.allergies || 'None',
              doctorName: data.health.doctorName || 'Dr. B. K. Sarma',
              doctorPhone: data.health.doctorPhone || '+91 98765 43210',
              conditions: data.health.conditions || 'Mild Memory Loss',
            });
          }
          if (data.consent) {
            setConsent({
              shareLocation: Boolean(data.consent.share_location),
              shareHealth: Boolean(data.consent.share_health),
              shareProgress: Boolean(data.consent.share_progress),
            });
          }
        }
      })
      .catch((e) => console.warn('Could not load wizard state:', e.message))
      .finally(() => setLoading(false));
  }, []);

  // Voice instructions on step change
  useEffect(() => {
    const isHi = (elder.language || i18n.language || 'en').startsWith('hi');
    const isTa = (elder.language || i18n.language || 'en').startsWith('ta');
    const lang = isHi ? 'hi' : isTa ? 'ta' : 'en';

    const stepInstructions = {
      1: isHi
        ? 'कदम 1/5: कृपया बुजुर्ग का नाम, उम्र और भाषा चुनें।'
        : isTa
        ? 'படி 1/5: முதியவரின் பெயர், வயது மற்றும் மொழியை உள்ளிடவும்.'
        : 'Step 1 of 5: Please enter elder name, age, and preferred language.',
      2: isHi
        ? 'कदम 2/5: सुरक्षित घर का पता और स्थान सेट करें ताकि हम आपको घर पहुंचा सकें।'
        : isTa
        ? 'படி 2/5: பாதுகாப்பான வீட்டு முகவரியை அமைக்கவும்.'
        : 'Step 2 of 5: Set your safe home address for guided navigation.',
      3: isHi
        ? 'कदम 3/5: परिवार के सदस्यों की तस्वीर और आवाज़ जोड़ें।'
        : isTa
        ? 'படி 3/5: குடும்ப உறுப்பினர்களின் படம் மற்றும் குரல் பதிவைச் சேர்க்கவும்.'
        : 'Step 3 of 5: Add family members with their photo and voice recording.',
      4: isHi
        ? 'कदम 4/5: दैनिक दवाइयों और समय का विवरण दें।'
        : isTa
        ? 'படி 4/5: தினசரி மருந்து விவரங்களைச் சேர்க்கவும்.'
        : 'Step 4 of 5: Add your daily medicines and reminder timings.',
      5: isHi
        ? 'कदम 5/5: आपातकालीन संपर्क और सुरक्षा सहमति की पुष्टि करें।'
        : isTa
        ? 'படி 5/5: அவசர தொடர்புகள் மற்றும் பாதுகாப்பு அனுமதியை உறுதிப்படுத்தவும்.'
        : 'Step 5 of 5: Confirm emergency contacts and safety consent. Setup is almost done!',
    };

    if (stepInstructions[currentStep]) {
      cancelSpeech();
      speak(stepInstructions[currentStep], { lang, rate: 0.75 });
    }

    return () => cancelSpeech();
  }, [currentStep, elder.language, i18n.language]);

  // Cleanup timer & audio URLs
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    };
  }, [recordedAudioUrl]);

  // Handle Photo selection with immediate preview
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a valid JPG, PNG, or WebP photo.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewFamily((prev) => ({ ...prev, photoBase64: reader.result }));
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setNewFamily((prev) => ({ ...prev, photoBase64: null }));
  };

  // Microphone recording
  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedAudioBlob(audioBlob);

        const url = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(url);

        // Convert to base64 for persistent database upload
        const reader = new FileReader();
        reader.onloadend = () => {
          setNewFamily((prev) => ({ ...prev, voiceBase64: reader.result }));
        };
        reader.readAsDataURL(audioBlob);

        // Stop stream tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordDuration((prev) => {
          if (prev >= 60) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      setError('Microphone permission denied or not supported: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
  };

  const deleteVoiceRecording = () => {
    if (isPlayingPreview && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    setIsPlayingPreview(false);
    setRecordedAudioBlob(null);
    if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    setRecordedAudioUrl(null);
    setRecordDuration(0);
    setNewFamily((prev) => ({ ...prev, voiceBase64: null }));
  };

  const togglePlayAudio = () => {
    if (!audioPlayerRef.current || !recordedAudioUrl) return;
    if (isPlayingPreview) {
      audioPlayerRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  // Audio file upload alternative
  const handleAudioFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setRecordedAudioUrl(url);
    setRecordDuration(5);

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewFamily((prev) => ({ ...prev, voiceBase64: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  // GPS Auto-Detect for Home Location
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHomePlace((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
        setSuccessMsg('Current location detected successfully!');
        setTimeout(() => setSuccessMsg(null), 3000);
      },
      (err) => {
        setLocating(false);
        setError('Location detection failed: ' + err.message);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Save Step 1: Elder Profile
  const handleSaveStep1 = async () => {
    if (!elder.name.trim()) {
      setError('Please enter the elder name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/wizard/step-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(elder),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not save elder details');
      if (data.elder) updateElder(data.elder);
      setCurrentStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Save Step 2: Home Address
  const handleSaveStep2 = async () => {
    if (!homePlace.latitude || !homePlace.longitude) {
      setError('Home latitude and longitude are required for navigation.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/wizard/step-2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(homePlace),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not save home location');
      setCurrentStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Add Family Member (Step 3)
  const handleAddFamilyMember = async () => {
    if (!newFamily.name.trim()) {
      setError('Please enter the family member name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/family/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...newFamily,
          phone: newFamily.phone || '+91 98765 00000',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not save family member');

      setFamilyList((prev) => [...prev, data.member]);
      // Reset form
      setNewFamily({
        name: '',
        relationship: 'son',
        phone: '',
        isEmergencyContact: true,
        emergencyPriority: familyList.length + 2,
        photoBase64: null,
        voiceBase64: null,
      });
      deleteVoiceRecording();
      setSuccessMsg('Family member saved successfully with persistent photo & voice!');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete family member from list
  const handleDeleteMember = async (id) => {
    try {
      await fetch(`/api/family/members/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setFamilyList((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.warn('Could not delete member:', err.message);
    }
  };

  // Generate 7-day Relative Upload Link
  const handleGenerateUploadLink = async () => {
    try {
      const res = await fetch('/api/wizard/family/generate-token', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setUploadLink(data.url);
      }
    } catch (e) {
      console.warn(e.message);
    }
  };

  // Save Step 4: Medicines
  const handleAddMedicine = async () => {
    if (!newMedicine.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/wizard/step-7/medicines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newMedicine),
      });
      const data = await res.json();
      if (data.success) {
        setMedicinesList((prev) => [...prev, data.medicine]);
        setNewMedicine({
          name: '',
          dose: '1 tablet',
          shapeColor: 'round-white',
          timesPerDay: ['08:00'],
          beforeAfterFood: 'after',
          notes: 'Take with warm water',
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Save Step 5 & Complete Wizard
  const handleCompleteWizard = async () => {
    setSaving(true);
    setError(null);
    try {
      // 1. Save Health details
      await fetch('/api/wizard/step-8/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(health),
      });

      // 2. Save Consent and mark profile complete
      await fetch('/api/wizard/step-9/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(consent),
      });

      await fetch('/api/wizard/complete', {
        method: 'POST',
        credentials: 'include',
      });

      localStorage.setItem('smriti_profile_complete', 'true');
      if (authElder) {
        updateElder({ ...authElder, profile_completed: true });
      }

      speak('Congratulations! Setup is complete. Welcome to Smriti Saathi.', { lang: 'en', rate: 0.8 });
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-bold text-slate-700">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mr-3" />
        Loading Setup Wizard...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
      {/* Step Header */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 md:p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
              Elder Onboarding
            </span>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 mt-2">
              Step {currentStep} of {totalSteps}
            </h1>
          </div>
          <button
            onClick={() => setCurrentStep(5)}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-xl transition-colors"
          >
            Quick Finish ➔
          </button>
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-5 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-sm font-semibold flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* STEP 1: Elder Details */}
      {currentStep === 1 && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <User className="w-6 h-6 text-indigo-600" />
            <h2 className="text-lg font-black text-slate-800">1. Elder Details (बुजुर्ग की जानकारी)</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Elder's Full Name *</label>
              <input
                type="text"
                value={elder.name}
                onChange={(e) => setElder({ ...elder, name: e.target.value })}
                placeholder="e.g. Ramesh"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Age (वर्ष) *</label>
              <input
                type="number"
                value={elder.age}
                onChange={(e) => setElder({ ...elder, age: e.target.value })}
                placeholder="e.g. 74"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Preferred Spoken Language *</label>
              <select
                value={elder.language}
                onChange={(e) => setElder({ ...elder, language: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="en">English</option>
                <option value="hi">हिंदी (Hindi)</option>
                <option value="ta">தமிழ் (Tamil)</option>
                <option value="as">অসমীয়া (Assamese)</option>
                <option value="bn">বাংলা (Bengali)</option>
                <option value="te">తెలుగు (Telugu)</option>
                <option value="ml">മലയാളം (Malayalam)</option>
                <option value="kn">ಕನ್ನಡ (Kannada)</option>
                <option value="mr">मराठी (Marathi)</option>
                <option value="gu">ગુજરાતી (Gujarati)</option>
                <option value="or">ଓଡ଼ିଆ (Odia)</option>
                <option value="pa">ਪੰਜਾਬੀ (Punjabi)</option>
                <option value="ur">اردو (Urdu)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Spoken Voice Speed</label>
              <select
                value={elder.voiceSpeed}
                onChange={(e) => setElder({ ...elder, voiceSpeed: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="0.65">Slow & Calm (0.65x - Recommended)</option>
                <option value="0.85">Moderate (0.85x)</option>
                <option value="1.0">Normal (1.0x)</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              onClick={handleSaveStep1}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-2xl shadow-md flex items-center gap-2 transition-transform active:scale-95"
            >
              <span>Next: Safe Home</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Safe Home Location */}
      {currentStep === 2 && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <HomeIcon className="w-6 h-6 text-indigo-600" />
            <h2 className="text-lg font-black text-slate-800">2. Safe Home Location (घर का सुरक्षित पता)</h2>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            When the elder feels lost, saying "Take Me Home" will immediately guide them back to these exact coordinates.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Home Street Address</label>
            <input
              type="text"
              value={homePlace.address}
              onChange={(e) => setHomePlace({ ...homePlace, address: e.target.value })}
              placeholder="e.g. Uzan Bazar, Guwahati, Assam"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Latitude (अक्षांश) *</label>
              <input
                type="text"
                value={homePlace.latitude}
                onChange={(e) => setHomePlace({ ...homePlace, latitude: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Longitude (देशांतर) *</label>
              <input
                type="text"
                value={homePlace.longitude}
                onChange={(e) => setHomePlace({ ...homePlace, longitude: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono font-bold text-slate-800"
              />
            </div>
          </div>

          <button
            onClick={handleDetectLocation}
            disabled={locating}
            className="w-full py-3 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <MapPin className="w-4 h-4 text-emerald-600" />
            {locating ? 'Detecting current GPS...' : 'Use My Current Location as Home'}
          </button>

          <div className="pt-4 flex justify-between">
            <button
              onClick={() => setCurrentStep(1)}
              className="text-slate-600 font-bold px-4 py-2 hover:bg-slate-100 rounded-2xl flex items-center gap-1.5"
            >
              <ChevronLeft className="w-5 h-5" /> Back
            </button>
            <button
              onClick={handleSaveStep2}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-2xl shadow-md flex items-center gap-2"
            >
              <span>Next: Family Members</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Family Members Photos & Voice Collection */}
      {currentStep === 3 && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-indigo-600" />
              <div>
                <h2 className="text-lg font-black text-slate-800">
                  3. Family Members ({familyList.length} saved)
                </h2>
                <p className="text-xs text-slate-500">Collect real photos & voice recordings for memory games</p>
              </div>
            </div>
            <button
              onClick={handleGenerateUploadLink}
              className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Share2 className="w-3.5 h-3.5" /> Relative Upload Link
            </button>
          </div>

          {uploadLink && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs text-indigo-900 font-semibold space-y-1">
              <span className="font-bold">7-Day Relative Photo & Voice Upload Link:</span>
              <div className="font-mono text-indigo-700 break-all">{uploadLink}</div>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(uploadLink);
                  alert('Link copied to clipboard!');
                }}
                className="mt-2 bg-indigo-600 text-white text-xs px-3 py-1 rounded-lg font-bold"
              >
                Copy Link
              </button>
            </div>
          )}

          {/* List of saved members */}
          {familyList.length > 0 && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Saved Family Profiles:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {familyList.map((m) => {
                  const relOption = RELATIONSHIP_OPTIONS.find((r) => r.value === m.relationship?.toLowerCase());
                  const relLabel = relOption ? t(relOption.labelKey, relOption.defaultLabel) : m.relationship;

                  return (
                    <div
                      key={m.id}
                      className="p-3.5 border border-slate-200 rounded-2xl flex items-center justify-between bg-slate-50 hover:bg-white transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center overflow-hidden flex-shrink-0 border border-indigo-200">
                          {m.hasPhoto || m.has_photo ? (
                            <img
                              src={`/api/family/members/${m.id}/photo`}
                              alt={m.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="font-black text-indigo-600 text-base">{m.name.charAt(0)}</span>
                          )}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm">{m.name}</h4>
                          <span className="text-xs text-slate-500 block">{relLabel}</span>
                          <div className="flex gap-1.5 mt-0.5">
                            {(m.hasPhoto || m.has_photo) && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                                Photo ✓
                              </span>
                            )}
                            {(m.hasVoice || m.has_voice) && (
                              <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded">
                                Voice ✓
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteMember(m.id)}
                        className="text-slate-400 hover:text-rose-600 p-2 rounded-xl"
                        title="Delete member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add Member Form */}
          <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200 space-y-4">
            <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-600" />
              Add Family Member (नया परिजन जोड़ें)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Aarav"
                  value={newFamily.name}
                  onChange={(e) => setNewFamily({ ...newFamily, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Relationship (संबंध) *</label>
                <select
                  value={newFamily.relationship}
                  onChange={(e) => setNewFamily({ ...newFamily, relationship: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                >
                  {RELATIONSHIP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey, opt.defaultLabel)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Phone Number (फोन नंबर)</label>
              <input
                type="text"
                placeholder="+91 98765 00000"
                value={newFamily.phone}
                onChange={(e) => setNewFamily({ ...newFamily, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
              />
            </div>

            {/* Photo Upload & Preview */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 mb-2">Member Photo (तस्वीर)</label>
              <div className="flex items-center gap-4">
                {newFamily.photoBase64 ? (
                  <div className="relative w-20 h-20 rounded-2xl overflow-hidden border-2 border-indigo-200 flex-shrink-0">
                    <img src={newFamily.photoBase64} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-1 shadow"
                      title="Remove photo"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center flex-shrink-0 text-slate-400">
                    <Camera className="w-6 h-6" />
                  </div>
                )}

                <div className="flex-1">
                  <label className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-bold px-4 py-2 border border-slate-300 rounded-xl text-xs cursor-pointer shadow-sm transition-colors">
                    <Upload className="w-4 h-4 text-slate-500" />
                    {newFamily.photoBase64 ? 'Replace Photo' : 'Select Photo (JPG, PNG, WebP)'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handlePhotoSelect}
                    />
                  </label>
                  <p className="text-[11px] text-slate-400 mt-1">Saved permanently to PostgreSQL database</p>
                </div>
              </div>
            </div>

            {/* Voice Recording via Device Microphone or File */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Voice Recording (आवाज़ रिकॉर्ड करें या अपलोड करें)
              </label>

              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {!isRecording ? (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="inline-flex items-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-3.5 py-2 rounded-xl text-xs border border-rose-200 transition-colors"
                    >
                      <Mic className="w-4 h-4 text-rose-600" />
                      Record Voice (माइक से बोलें)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="inline-flex items-center gap-2 bg-rose-600 text-white font-bold px-3.5 py-2 rounded-xl text-xs animate-pulse"
                    >
                      <Square className="w-4 h-4" />
                      Stop Recording ({recordDuration}s)
                    </button>
                  )}

                  <label className="inline-flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold px-3 py-2 rounded-xl text-xs border border-slate-200 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    Upload Audio File
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={handleAudioFileUpload}
                    />
                  </label>
                </div>

                {recordedAudioUrl && (
                  <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                    <audio
                      ref={audioPlayerRef}
                      src={recordedAudioUrl}
                      onEnded={() => setIsPlayingPreview(false)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={togglePlayAudio}
                      className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl"
                    >
                      {isPlayingPreview ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <span className="text-xs font-bold text-slate-600">
                      Audio Ready ({recordDuration > 0 ? `${recordDuration}s` : 'Recorded'})
                    </span>
                    <button
                      type="button"
                      onClick={deleteVoiceRecording}
                      className="ml-auto text-xs text-rose-600 hover:text-rose-700 font-bold"
                    >
                      Delete Audio
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddFamilyMember}
              disabled={saving}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-2xl text-xs shadow-md flex items-center justify-center gap-2 mt-2"
            >
              <Plus className="w-4 h-4" />
              Save Family Member
            </button>
          </div>

          <div className="pt-4 flex justify-between">
            <button
              onClick={() => setCurrentStep(2)}
              className="text-slate-600 font-bold px-4 py-2 hover:bg-slate-100 rounded-2xl flex items-center gap-1.5"
            >
              <ChevronLeft className="w-5 h-5" /> Back
            </button>
            <button
              onClick={() => setCurrentStep(4)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-2xl shadow-md flex items-center gap-2"
            >
              <span>Next: Daily Medicines</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Daily Medicines & Reminders */}
      {currentStep === 4 && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <Pill className="w-6 h-6 text-indigo-600" />
            <h2 className="text-lg font-black text-slate-800">4. Daily Medicines (दैनिक दवाइयाँ)</h2>
          </div>

          {medicinesList.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Scheduled Medicines:</span>
              <div className="space-y-2">
                {medicinesList.map((m, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-slate-800 text-sm">{m.name}</span>
                      <span className="text-slate-500 block">{m.dose} • {m.before_after_food || 'after food'}</span>
                    </div>
                    <span className="bg-indigo-100 text-indigo-800 font-bold px-2 py-1 rounded-lg">Active</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Add Medicine</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Medicine Name (e.g. Ecosprin 75)"
                value={newMedicine.name}
                onChange={(e) => setNewMedicine({ ...newMedicine, name: e.target.value })}
                className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
              />
              <input
                type="text"
                placeholder="Dose (e.g. 1 tablet)"
                value={newMedicine.dose}
                onChange={(e) => setNewMedicine({ ...newMedicine, dose: e.target.value })}
                className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
              />
            </div>
            <button
              onClick={handleAddMedicine}
              className="w-full bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2.5 rounded-xl text-xs"
            >
              + Add This Medicine
            </button>
          </div>

          <div className="pt-4 flex justify-between">
            <button
              onClick={() => setCurrentStep(3)}
              className="text-slate-600 font-bold px-4 py-2 hover:bg-slate-100 rounded-2xl flex items-center gap-1.5"
            >
              <ChevronLeft className="w-5 h-5" /> Back
            </button>
            <button
              onClick={() => setCurrentStep(5)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-2xl shadow-md flex items-center gap-2"
            >
              <span>Next: Emergency & Consent</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Emergency & Safety Consent */}
      {currentStep === 5 && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            <h2 className="text-lg font-black text-slate-800">5. Emergency & Consent (आपातकालीन और सहमति)</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Doctor Name</label>
              <input
                type="text"
                value={health.doctorName}
                onChange={(e) => setHealth({ ...health, doctorName: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Doctor Phone</label>
              <input
                type="text"
                value={health.doctorPhone}
                onChange={(e) => setHealth({ ...health, doctorPhone: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Blood Group</label>
              <input
                type="text"
                value={health.bloodGroup}
                onChange={(e) => setHealth({ ...health, bloodGroup: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Allergies / Conditions</label>
              <input
                type="text"
                value={health.allergies}
                onChange={(e) => setHealth({ ...health, allergies: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
          </div>

          {/* Privacy Consent Toggles */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Privacy & Safety Permissions</h4>
            <label className="flex items-center gap-3 cursor-pointer text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={consent.shareLocation}
                onChange={(e) => setConsent({ ...consent, shareLocation: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              Share live GPS location with verified family contacts during wandering alerts
            </label>
            <label className="flex items-center gap-3 cursor-pointer text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={consent.shareProgress}
                onChange={(e) => setConsent({ ...consent, shareProgress: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              Share cognitive game memory practice reports with family
            </label>
          </div>

          <div className="pt-4 flex justify-between">
            <button
              onClick={() => setCurrentStep(4)}
              className="text-slate-600 font-bold px-4 py-2 hover:bg-slate-100 rounded-2xl flex items-center gap-1.5"
            >
              <ChevronLeft className="w-5 h-5" /> Back
            </button>
            <button
              onClick={handleCompleteWizard}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-2xl shadow-lg flex items-center gap-2 transition-transform active:scale-95"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Finish Setup & Go to Home</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
