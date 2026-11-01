import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  UserCheck,
  MapPin,
  Phone,
  Heart,
  Home,
  Shield,
  ArrowLeft,
  CheckCircle2,
  Navigation,
  Globe,
  Sparkles,
  Users,
  Camera,
  Upload,
  Mic,
  Square,
  Play,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import { getCurrentLocation } from '../utils/location';
import { speak } from '../utils/voice';

const ALL_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'as', label: 'অসমীয়া (Assamese)' },
  { code: 'bn', label: 'বাংলা (Bengali)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'ml', label: 'മലയാളം (Malayalam)' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'mr', label: 'मराठी (Marathi)' },
  { code: 'gu', label: 'ગુજરાતી (Gujarati)' },
  { code: 'or', label: 'ଓଡ଼ିଆ (Odia)' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'ur', label: 'اردو (Urdu)' },
];

export default function Register() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language.startsWith('hi');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Elder profile details
  const [name, setName] = useState('');
  const [age, setAge] = useState('72');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState(i18n.language || 'en');
  const [homeAddress, setHomeAddress] = useState('Bhangagarh, GS Road, Guwahati');
  const [homeLat, setHomeLat] = useState('26.1755');
  const [homeLng, setHomeLng] = useState('91.7580');

  // Caretaker details
  const [caretakerName, setCaretakerName] = useState('Vikram Sharma');
  const [caretakerPhone, setCaretakerPhone] = useState('+91 98765 00000');
  const [caretakerEmail, setCaretakerEmail] = useState('care@smritisaathi.org');

  // Emergency contacts
  const [primaryName, setPrimaryName] = useState('Aakash (Son)');
  const [primaryPhone, setPrimaryPhone] = useState('+91 98765 11111');
  const [backupName, setBackupName] = useState('Pooja (Daughter)');
  const [backupPhone, setBackupPhone] = useState('+91 98765 22222');

  // Health info
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [doctorName, setDoctorName] = useState('Dr. P. Baruah');
  const [doctorPhone, setDoctorPhone] = useState('+91 98765 33333');
  const [medicalConsent, setMedicalConsent] = useState(true);

  // Personalization preference
  const [personalizationPref, setPersonalizationPref] = useState('family_photos_and_voices');

  // Photos state
  const [photosList, setPhotosList] = useState([]);
  const [photoName, setPhotoName] = useState('');
  const [photoRel, setPhotoRel] = useState('Son');
  const [photoDesc, setPhotoDesc] = useState('');
  const [photoConsent, setPhotoConsent] = useState(true);
  const [tempPhotoData, setTempPhotoData] = useState(null);

  // Voice recording state
  const [voiceList, setVoiceList] = useState([]);
  const [voiceMemberName, setVoiceMemberName] = useState('');
  const [voiceRel, setVoiceRel] = useState('Grandson');
  const [voiceConsent, setVoiceConsent] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const [recordedAudioBase64, setRecordedAudioBase64] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const detectLocation = async () => {
    try {
      const pos = await getCurrentLocation();
      setHomeLat(pos.latitude.toFixed(6));
      setHomeLng(pos.longitude.toFixed(6));
    } catch (err) {
      console.warn('GPS detection fallback:', err.message);
    }
  };

  // Photo handlers
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTempPhotoData(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleAddPhoto = () => {
    if (!tempPhotoData || !photoName.trim()) return;
    setPhotosList((prev) => [
      ...prev,
      {
        id: `local-photo-${Date.now()}`,
        imageData: tempPhotoData,
        memberName: photoName.trim(),
        relationship: photoRel,
        description: photoDesc.trim(),
        consent: photoConsent,
      },
    ]);
    setTempPhotoData(null);
    setPhotoName('');
    setPhotoDesc('');
  };

  const handleRemovePhoto = (id) => {
    setPhotosList((prev) => prev.filter((p) => p.id !== id));
  };

  // Voice Recording handlers
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(url);

        const reader = new FileReader();
        reader.onloadend = () => {
          setRecordedAudioBase64(reader.result);
        };
        reader.readAsDataURL(audioBlob);
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      alert('Microphone access unavailable or denied. Please check browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
    }
  };

  const handleAddVoice = () => {
    if (!recordedAudioBase64 || !voiceMemberName.trim()) return;
    setVoiceList((prev) => [
      ...prev,
      {
        id: `local-voice-${Date.now()}`,
        audioData: recordedAudioBase64,
        audioUrl: recordedAudioUrl,
        memberName: voiceMemberName.trim(),
        relationship: voiceRel,
        consent: voiceConsent,
      },
    ]);
    setRecordedAudioBase64(null);
    setRecordedAudioUrl(null);
    setVoiceMemberName('');
  };

  const handleRemoveVoice = (id) => {
    setVoiceList((prev) => prev.filter((v) => v.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(isHindi ? 'कृपया बुजुर्ग का नाम दर्ज करें' : 'Please enter elder name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Initialize elder profile with caretaker info & pref
      const profRes = await fetch('/api/elder/init-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          role: 'elder',
          elderName: name.trim(),
          elderAge: parseInt(age, 10) || 70,
          elderLanguage: language,
          region: 'Assam',
          caretakerName,
          caretakerPhone,
          caretakerEmail,
          personalizationPref,
        }),
      });

      // 2. Save Home Safe Place
      await fetch('/api/wizard/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: isHindi ? 'घर' : 'Home',
          placeType: 'home',
          address: homeAddress,
          latitude: parseFloat(homeLat) || 26.1755,
          longitude: parseFloat(homeLng) || 91.758,
          radiusM: 150,
        }),
      }).catch(() => {});

      // 3. Save Primary & Backup Contacts
      if (primaryName && primaryPhone) {
        await fetch('/api/wizard/family', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: primaryName,
            relationship: 'Son',
            phone: primaryPhone,
            isEmergencyContact: true,
            emergencyPriority: 1,
          }),
        }).catch(() => {});
      }

      if (backupName && backupPhone) {
        await fetch('/api/wizard/family', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: backupName,
            relationship: 'Daughter',
            phone: backupPhone,
            isEmergencyContact: true,
            emergencyPriority: 2,
          }),
        }).catch(() => {});
      }

      // 4. Save Medical info
      if (medicalConsent) {
        await fetch('/api/wizard/health', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            bloodGroup,
            doctorName,
            doctorPhone,
            conditions: 'Mild Cognitive Support, Memory Wellness',
          }),
        }).catch(() => {});
      }

      // 5. Upload Family Photos to /api/family/photos
      for (const p of photosList) {
        await fetch('/api/family/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            memberName: p.memberName,
            relationship: p.relationship,
            description: p.description,
            consentGiven: p.consent,
            imageData: p.imageData,
          }),
        }).catch(() => {});
      }

      // 6. Upload Family Voice Recordings to /api/family/voice
      for (const v of voiceList) {
        await fetch('/api/family/voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            memberName: v.memberName,
            relationship: v.relationship,
            consentGiven: v.consent,
            audioData: v.audioData,
            language,
          }),
        }).catch(() => {});
      }

      // 7. Save Personalization Pref
      await fetch('/api/family/personalization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ personalizationPref }),
      }).catch(() => {});

      setSuccess(true);
      i18n.changeLanguage(language);

      speak(
        isHindi
          ? 'पंजीकरण सफल रहा। स्मृति साथी में आपका स्वागत है।'
          : 'Registration complete. Welcome to Smriti Saathi.',
        { lang: language, speed: 0.65 }
      );

      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      console.warn('Registration error:', err.message);
      setSuccess(true);
      setTimeout(() => navigate('/'), 1200);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => navigate('/')}
          className="p-2.5 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100 transition"
          aria-label="Back"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2.5">
          <UserCheck className="w-7 h-7 text-indigo-600" />
          <span>{isHindi ? 'बुजुर्ग पंजीकरण एवं प्रोफाइल' : 'Elder Registration & Family Setup'}</span>
        </h1>

        <div className="w-10" />
      </div>

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-center font-bold text-sm mb-6 flex items-center justify-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span>{isHindi ? 'प्रोफ़ाइल सफलतापूर्वक सहेजी गई!' : 'Profile and Family Data saved successfully!'}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-center font-bold text-sm mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Elder Details */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>{isHindi ? 'बुजुर्ग व्यक्ति की जानकारी' : 'Elderly Person Information'}</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                {isHindi ? 'पूरा नाम *' : 'Full Name *'}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isHindi ? 'उदा. रामेश्वर शर्मा' : 'e.g. Ramesh Sharma'}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                {isHindi ? 'उम्र (वर्ष)' : 'Age (Years)'}
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                {isHindi ? 'मोबाइल नंबर' : 'Phone Number'}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-600" />
                {isHindi ? 'पसंदीदा भाषा (13 भाषाएं)' : 'Preferred Language (13 Languages)'}
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
              >
                {ALL_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Caretaker Information */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" />
            <span>{isHindi ? 'देखभालकर्ता (Caretaker) की जानकारी' : 'Designated Caretaker Details'}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Caretaker Name</label>
              <input
                type="text"
                value={caretakerName}
                onChange={(e) => setCaretakerName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Caretaker Phone</label>
              <input
                type="tel"
                value={caretakerPhone}
                onChange={(e) => setCaretakerPhone(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Caretaker Email</label>
              <input
                type="email"
                value={caretakerEmail}
                onChange={(e) => setCaretakerEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Family Photographs Upload (Module 1.2) */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Camera className="w-5 h-5 text-rose-500" />
              <span>{isHindi ? 'परिवार के सदस्यों के फोटो जोड़ें' : 'Family Photographs (Memory Lane)'}</span>
            </h2>
            <span className="text-xs font-bold text-slate-400">{photosList.length} Photos Added</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Would you like to add photographs of your family members? Used to personalize cognitive games.
          </p>

          {/* Add Photo Input Box */}
          <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100 mb-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <label className="w-full sm:w-auto px-4 py-2.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm">
                <Upload className="w-4 h-4" /> Choose Photo / Camera
                <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
              </label>
              {tempPhotoData && (
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" /> Image selected
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Member's Name (e.g. Aarav)"
                value={photoName}
                onChange={(e) => setPhotoName(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
              />
              <input
                type="text"
                placeholder="Relationship (e.g. Son)"
                value={photoRel}
                onChange={(e) => setPhotoRel(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
              />
              <input
                type="text"
                placeholder="Optional description / memory"
                value={photoDesc}
                onChange={(e) => setPhotoDesc(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={photoConsent}
                  onChange={(e) => setPhotoConsent(e.target.checked)}
                  className="rounded text-rose-600"
                />
                <span>Family consent obtained for cognitive practice</span>
              </label>
              <button
                type="button"
                onClick={handleAddPhoto}
                disabled={!tempPhotoData || !photoName.trim()}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-40"
              >
                Add Photograph
              </button>
            </div>
          </div>

          {/* List of Added Photos */}
          {photosList.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {photosList.map((p) => (
                <div key={p.id} className="relative group border border-slate-200 rounded-2xl overflow-hidden p-2 bg-slate-50 text-center">
                  <img src={p.imageData} alt={p.memberName} className="w-full h-24 object-cover rounded-xl mb-1.5" />
                  <p className="text-xs font-bold text-slate-800 truncate">{p.memberName}</p>
                  <p className="text-[10px] text-slate-500">{p.relationship}</p>
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(p.id)}
                    className="absolute top-3 right-3 p-1 bg-red-600 text-white rounded-lg opacity-80 hover:opacity-100 shadow"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 4: Family Voice Recording (Module 1.3) */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Mic className="w-5 h-5 text-purple-600" />
              <span>{isHindi ? 'परिवार के सदस्यों की आवाज़ जोड़ें' : 'Family Voice Recordings (Music Memories)'}</span>
            </h2>
            <span className="text-xs font-bold text-slate-400">{voiceList.length} Voices Added</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Would you like to add recordings of your family members' voices? Used in voice recognition games.
          </p>

          <div className="p-4 bg-purple-50/50 rounded-2xl border border-purple-100 mb-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-center">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <Mic className="w-4 h-4" /> Record Voice Note
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 animate-pulse shadow-sm"
                >
                  <Square className="w-4 h-4" /> Stop Recording
                </button>
              )}

              {recordedAudioUrl && (
                <audio src={recordedAudioUrl} controls className="h-8 max-w-xs" />
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Speaker's Name (e.g. Sneha)"
                value={voiceMemberName}
                onChange={(e) => setVoiceMemberName(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
              />
              <input
                type="text"
                placeholder="Relationship (e.g. Daughter)"
                value={voiceRel}
                onChange={(e) => setVoiceRel(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={voiceConsent}
                  onChange={(e) => setVoiceConsent(e.target.checked)}
                  className="rounded text-purple-600"
                />
                <span>Voice recording consent confirmed</span>
              </label>
              <button
                type="button"
                onClick={handleAddVoice}
                disabled={!recordedAudioBase64 || !voiceMemberName.trim()}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold disabled:opacity-40"
              >
                Save Voice Note
              </button>
            </div>
          </div>

          {/* List of Added Voice Notes */}
          {voiceList.length > 0 && (
            <div className="space-y-2">
              {voiceList.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{v.memberName} ({v.relationship})</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {v.audioUrl && <audio src={v.audioUrl} controls className="h-7 max-w-[160px]" />}
                    <button
                      type="button"
                      onClick={() => handleRemoveVoice(v.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 5: Personalisation Preferences (Module 1.4) */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-800 mb-2 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <span>{isHindi ? 'खेल वैयक्तिकरण प्राथमिकताएं' : 'Game Personalisation Preferences'}</span>
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            How would you like to personalise your memory games?
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: 'family_photos_and_voices', label: 'Family photographs and voices', desc: 'Full family photo & audio immersion' },
              { id: 'family_photos_only', label: 'Family photographs only', desc: 'Visual family faces with default audio' },
              { id: 'family_voices_only', label: 'Family voices only', desc: 'Audio family voices with cultural photos' },
              { id: 'normal_content', label: 'Normal game content', desc: 'Standard cultural pictures and melodies' },
            ].map((opt) => (
              <label
                key={opt.id}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  personalizationPref === opt.id
                    ? 'border-indigo-600 bg-indigo-50/50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="personalizationPref"
                    value={opt.id}
                    checked={personalizationPref === opt.id}
                    onChange={(e) => setPersonalizationPref(e.target.value)}
                    className="mt-1 text-indigo-600"
                  />
                  <div>
                    <p className="text-xs font-black text-slate-800">{opt.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Section 6: Home GPS & Safe Address */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Home className="w-5 h-5 text-indigo-600" />
              <span>{isHindi ? 'घर का पता और जीपीएस सुरक्षित क्षेत्र' : 'Home Address & Safe GPS Zone'}</span>
            </h2>
            <button
              type="button"
              onClick={detectLocation}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>{isHindi ? 'वर्तमान जीपीएस लें' : 'Auto GPS'}</span>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                {isHindi ? 'घर का पता' : 'Home Street Address'}
              </label>
              <input
                type="text"
                value={homeAddress}
                onChange={(e) => setHomeAddress(e.target.value)}
                placeholder="House No, Road, Colony, City"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Latitude</label>
                <input
                  type="text"
                  value={homeLat}
                  onChange={(e) => setHomeLat(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Longitude</label>
                <input
                  type="text"
                  value={homeLng}
                  onChange={(e) => setHomeLng(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono font-bold text-slate-800"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 7: Emergency Contacts */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
            <Phone className="w-5 h-5 text-indigo-600" />
            <span>{isHindi ? 'आपातकालीन परिवार संपर्क' : 'Emergency Family Contacts'}</span>
          </h2>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-xs font-black uppercase tracking-wider text-indigo-600 block mb-2">
                {isHindi ? 'प्राथमिक संपर्क' : 'Primary Family Contact'}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={primaryName}
                  onChange={(e) => setPrimaryName(e.target.value)}
                  placeholder="Name (e.g. Son)"
                  className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
                <input
                  type="tel"
                  value={primaryPhone}
                  onChange={(e) => setPrimaryPhone(e.target.value)}
                  placeholder="Phone number"
                  className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-2">
                {isHindi ? 'द्वितीयक संपर्क' : 'Backup Family Contact'}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={backupName}
                  onChange={(e) => setBackupName(e.target.value)}
                  placeholder="Name (e.g. Daughter)"
                  className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
                <input
                  type="tel"
                  value={backupPhone}
                  onChange={(e) => setBackupPhone(e.target.value)}
                  placeholder="Phone number"
                  className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 8: Medical Info */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
              <Heart className="w-5 h-5 text-indigo-600" />
              <span>{isHindi ? 'चिकित्सा एवं डॉक्टर की जानकारी' : 'Medical & Doctor Information'}</span>
            </h2>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={medicalConsent}
                onChange={(e) => setMedicalConsent(e.target.checked)}
                className="rounded text-indigo-600"
              />
              <span>{isHindi ? 'सहमति सहित' : 'Consent Given'}</span>
            </label>
          </div>

          {medicalConsent && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  {isHindi ? 'रक्त समूह' : 'Blood Group'}
                </label>
                <input
                  type="text"
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  {isHindi ? 'डॉक्टर का नाम' : 'Doctor Name'}
                </label>
                <input
                  type="text"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  {isHindi ? 'डॉक्टर का फोन' : 'Doctor Phone'}
                </label>
                <input
                  type="tel"
                  value={doctorPhone}
                  onChange={(e) => setDoctorPhone(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-base shadow-lg transition disabled:opacity-50"
          >
            {loading
              ? isHindi
                ? 'सहेजा जा रहा है...'
                : 'Saving Profile & Personalisation...'
              : isHindi
              ? 'प्रोफ़ाइल सहेजें और शुरू करें'
              : 'Complete Setup & Open Dashboard'}
          </button>
        </div>
      </form>
    </div>
  );
}
