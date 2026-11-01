import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Home as HomeIcon,
  Users,
  MapPin,
  PhoneCall,
  Car,
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
  Share2,
} from 'lucide-react';
import { speak } from '../utils/voice';

export default function Wizard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Wizard state loaded from server
  const [elder, setElder] = useState({
    name: 'Ramesh',
    age: '74',
    language: 'hi',
    region: 'Assam',
    voiceSpeed: '0.65',
    photoBase64: null,
  });

  const [homePlace, setHomePlace] = useState({
    name: 'Home',
    address: 'Uzan Bazar, Guwahati, Assam',
    latitude: '26.1865',
    longitude: '91.7541',
  });

  const [familyList, setFamilyList] = useState([]);
  const [newFamily, setNewFamily] = useState({
    name: '',
    relationship: 'Son',
    phone: '',
    address: '',
    isEmergencyContact: true,
    emergencyPriority: 1,
    photoBase64: null,
  });

  const [placesList, setPlacesList] = useState([]);
  const [newPlace, setNewPlace] = useState({
    name: '',
    address: '',
    latitude: '26.1850',
    longitude: '91.7500',
    placeType: 'temple',
  });

  const [driversList, setDriversList] = useState([]);
  const [newDriver, setNewDriver] = useState({
    name: '',
    phone: '',
    vehicleType: 'auto',
    area: 'Uzan Bazar',
    notes: 'Known family auto driver',
  });

  const [medicinesList, setMedicinesList] = useState([]);
  const [newMedicine, setNewMedicine] = useState({
    name: 'Ecosprin 75',
    dose: '1 tablet',
    shapeColor: 'round-white',
    timesPerDay: ['08:00', '20:00'],
    beforeAfterFood: 'after',
    tabletsRemaining: 30,
    refillThreshold: 5,
    notes: 'Take with warm water',
  });

  const [health, setHealth] = useState({
    bloodGroup: 'B+',
    allergies: 'Penicillin, Dust',
    doctorName: 'Dr. B. K. Sarma',
    doctorPhone: '+919876543210',
    conditions: 'Mild Cognitive Impairment, Hypertension',
  });

  const [consent, setConsent] = useState({
    shareLocation: true,
    shareHealth: true,
    shareProgress: true,
  });

  const [uploadLink, setUploadLink] = useState(null);

  // Fetch saved state on mount
  useEffect(() => {
    fetch('/api/wizard/state', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          if (data.elder) {
            setElder({
              name: data.elder.name || 'Ramesh',
              age: data.elder.age || '74',
              language: data.elder.language || 'hi',
              region: data.elder.region || 'Assam',
              voiceSpeed: String(data.elder.voice_speed || '0.65'),
              photoBase64: null,
            });
          }
          if (data.places && data.places.length > 0) {
            setPlacesList(data.places);
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
          if (data.family) setFamilyList(data.family);
          if (data.drivers) setDriversList(data.drivers);
          if (data.medicines) setMedicinesList(data.medicines);
          if (data.health) setHealth(data.health);
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

  // Voice guidance on step change
  useEffect(() => {
    const stepPrompts = {
      1: 'Step 1: Elder details. Please enter name, age, language, and voice speed.',
      2: 'Step 2: Home address. Set the safe home coordinates for navigation.',
      3: 'Step 3: Family members. Add photos, voice messages, and emergency contacts.',
      4: 'Step 4: Saved places. Review safe destinations like temple and hospital.',
      5: 'Step 5: Emergency priority. Set the contact order for emergency calls.',
      6: 'Step 6: Auto and Cab drivers. Save trusted drivers for easy rides.',
      7: 'Step 7: Medicines and schedules. Set pill reminders and dosages.',
      8: 'Step 8: Health details. Blood group, allergies, and doctor contact.',
      9: 'Step 9: Privacy and consent. You are almost all set!',
    };
    if (stepPrompts[currentStep]) {
      speak(stepPrompts[currentStep], { lang: 'en', rate: 0.8 });
    }
  }, [currentStep]);

  // Handle Photo upload
  const handlePhotoUpload = (e, callback) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => callback(reader.result);
      reader.readAsDataURL(file);
    }
  };

  // Step 1 Save
  const saveStep1 = async () => {
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
      if (!res.ok) throw new Error(data.message);
      setCurrentStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Step 2 Save Home
  const saveStep2 = async () => {
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
      if (!res.ok) throw new Error(data.message);
      setCurrentStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Step 3 Add Family Member
  const addFamilyMember = async () => {
    if (!newFamily.name || !newFamily.phone) {
      setError('Please provide name and phone for family member');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/wizard/step-3/family', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newFamily),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setFamilyList([...familyList, data.member]);
      setNewFamily({
        name: '',
        relationship: 'Daughter',
        phone: '',
        address: '',
        isEmergencyContact: true,
        emergencyPriority: familyList.length + 2,
        photoBase64: null,
      });
      setSuccessMsg('Family member saved successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Generate 7-day upload link for relatives
  const generateUploadLink = async () => {
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

  // Step 4 Add Saved Place
  const addPlace = async () => {
    if (!newPlace.name) return;
    setSaving(true);
    try {
      const res = await fetch('/api/wizard/step-4/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newPlace),
      });
      const data = await res.json();
      if (data.success) {
        setPlacesList([...placesList, data.place]);
        setNewPlace({ name: '', address: '', latitude: '26.1850', longitude: '91.7500', placeType: 'market' });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Step 6 Add Driver
  const addDriver = async () => {
    if (!newDriver.name || !newDriver.phone) return;
    setSaving(true);
    try {
      const res = await fetch('/api/wizard/step-6/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newDriver),
      });
      const data = await res.json();
      if (data.success) {
        setDriversList([...driversList, data.driver]);
        setNewDriver({ name: '', phone: '', vehicleType: 'cab', area: 'Paltan Bazar', notes: '' });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Step 7 Add Medicine
  const addMedicine = async () => {
    if (!newMedicine.name || !newMedicine.dose) return;
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
        setMedicinesList([...medicinesList, data.medicine]);
        setNewMedicine({
          name: '',
          dose: '1 tablet',
          shapeColor: 'round-white',
          timesPerDay: ['09:00'],
          beforeAfterFood: 'after',
          tabletsRemaining: 30,
          refillThreshold: 5,
          notes: '',
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Step 8 Save Health
  const saveHealth = async () => {
    setSaving(true);
    try {
      await fetch('/api/wizard/step-8/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(health),
      });
      setCurrentStep(9);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Step 9 Save Consent & Complete
  const completeWizard = async () => {
    setSaving(true);
    try {
      await fetch('/api/wizard/step-9/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(consent),
      });
      speak('Congratulations! Setup is complete. Welcome to Smriti Saathi.', { lang: 'en' });
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-bold text-slate-700">
        Loading Setup Wizard...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header & Step Indicator */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800">
              Elder Setup Wizard
            </h1>
            <p className="text-sm text-slate-500">Step {currentStep} of 9</p>
          </div>
          <button
            onClick={() => setCurrentStep(9)}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg font-bold"
          >
            Quick Finish ➔
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / 9) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-semibold">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-semibold">
          {successMsg}
        </div>
      )}

      {/* STEP 1: Elder Details */}
      {currentStep === 1 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <User className="w-6 h-6 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">1. Elder Profile Details</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Elder Name</label>
              <input
                type="text"
                value={elder.name}
                onChange={(e) => setElder({ ...elder, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Age</label>
              <input
                type="number"
                value={elder.age}
                onChange={(e) => setElder({ ...elder, age: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Primary Language</label>
              <select
                value={elder.language}
                onChange={(e) => setElder({ ...elder, language: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-semibold"
              >
                <option value="hi">हिंदी (Hindi)</option>
                <option value="as">অসমীয়া (Assamese)</option>
                <option value="bn">বাংলা (Bengali)</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Voice Speed</label>
              <select
                value={elder.voiceSpeed}
                onChange={(e) => setElder({ ...elder, voiceSpeed: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-semibold"
              >
                <option value="0.55">Very Slow (0.55x)</option>
                <option value="0.65">Gentle Slow (0.65x) - Recommended</option>
                <option value="0.8">Normal (0.8x)</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              onClick={saveStep1}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-md flex items-center gap-2"
            >
              Next: Home Address <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Home Address */}
      {currentStep === 2 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <HomeIcon className="w-6 h-6 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">2. Elder Home Coordinates</h2>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Address / Landmark</label>
            <input
              type="text"
              value={homePlace.address}
              onChange={(e) => setHomePlace({ ...homePlace, address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Latitude</label>
              <input
                type="text"
                value={homePlace.latitude}
                onChange={(e) => setHomePlace({ ...homePlace, latitude: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Longitude</label>
              <input
                type="text"
                value={homePlace.longitude}
                onChange={(e) => setHomePlace({ ...homePlace, longitude: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-sm"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-between">
            <button
              onClick={() => setCurrentStep(1)}
              className="text-slate-600 px-4 py-2 font-bold hover:bg-slate-100 rounded-xl"
            >
              Back
            </button>
            <button
              onClick={saveStep2}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-md flex items-center gap-2"
            >
              Next: Family Members <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Family Members */}
      {currentStep === 3 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-800">3. Family Members ({familyList.length} saved)</h2>
            </div>
            <button
              onClick={generateUploadLink}
              className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5" /> Relative Upload Link
            </button>
          </div>

          {uploadLink && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 font-semibold break-all">
              7-Day Upload Link: <a href={uploadLink} target="_blank" rel="noreferrer" className="underline">{uploadLink}</a>
            </div>
          )}

          {/* List of existing members */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {familyList.map((m) => (
              <div key={m.id} className="p-3 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800">{m.name}</h4>
                  <p className="text-xs text-slate-500">{m.relationship} • {m.phone}</p>
                  {m.is_emergency_contact && (
                    <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                      Emergency #{m.emergency_priority}
                    </span>
                  )}
                </div>
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
            ))}
          </div>

          {/* Add Member Form */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-sm font-bold text-slate-700">Add New Family Member</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Name"
                value={newFamily.name}
                onChange={(e) => setNewFamily({ ...newFamily, name: e.target.value })}
                className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm"
              />
              <input
                type="text"
                placeholder="Relationship (e.g. Son)"
                value={newFamily.relationship}
                onChange={(e) => setNewFamily({ ...newFamily, relationship: e.target.value })}
                className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm"
              />
              <input
                type="text"
                placeholder="Phone (+91...)"
                value={newFamily.phone}
                onChange={(e) => setNewFamily({ ...newFamily, phone: e.target.value })}
                className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5 cursor-pointer bg-white px-3 py-2 border border-slate-300 rounded-xl">
                <Upload className="w-4 h-4 text-slate-500" /> Choose Photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhotoUpload(e, (b64) => setNewFamily({ ...newFamily, photoBase64: b64 }))}
                />
              </label>
              {newFamily.photoBase64 && <span className="text-xs text-emerald-600 font-bold">Photo attached!</span>}

              <button
                onClick={addFamilyMember}
                disabled={saving}
                className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl"
              >
                + Add Member
              </button>
            </div>
          </div>

          <div className="pt-4 flex justify-between">
            <button onClick={() => setCurrentStep(2)} className="text-slate-600 px-4 py-2 font-bold hover:bg-slate-100 rounded-xl">
              Back
            </button>
            <button
              onClick={() => setCurrentStep(4)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-md flex items-center gap-2"
            >
              Next: Saved Places <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Saved Places */}
      {currentStep === 4 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <MapPin className="w-6 h-6 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">4. Saved Safe Places ({placesList.length})</h2>
          </div>

          <div className="space-y-2">
            {placesList.map((p) => (
              <div key={p.id} className="p-3 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800">{p.name}</h4>
                  <p className="text-xs text-slate-500">{p.address || 'Address registered'}</p>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 rounded text-slate-600 uppercase">
                  {p.place_type}
                </span>
              </div>
            ))}
          </div>

          {/* Add place */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex gap-2">
            <input
              type="text"
              placeholder="Place Name (e.g. Sukreswar Temple)"
              value={newPlace.name}
              onChange={(e) => setNewPlace({ ...newPlace, name: e.target.value })}
              className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm"
            />
            <button onClick={addPlace} className="bg-indigo-600 text-white font-bold text-xs px-4 py-2 rounded-xl">
              + Add Place
            </button>
          </div>

          <div className="pt-4 flex justify-between">
            <button onClick={() => setCurrentStep(3)} className="text-slate-600 px-4 py-2 font-bold hover:bg-slate-100 rounded-xl">
              Back
            </button>
            <button onClick={() => setCurrentStep(5)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-md flex items-center gap-2">
              Next: Emergency Contacts <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Emergency Contacts */}
      {currentStep === 5 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <PhoneCall className="w-6 h-6 text-red-600" />
            <h2 className="text-lg font-bold text-slate-800">5. Emergency Call Priority</h2>
          </div>
          <p className="text-xs text-slate-500">
            When the elder triggers SOS, calls escalate sequentially through these contacts.
          </p>

          <div className="space-y-2">
            {familyList.map((m, idx) => (
              <div key={m.id} className="p-3 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800">{m.name} ({m.relationship})</h4>
                  <p className="text-xs text-slate-500">{m.phone}</p>
                </div>
                <span className="text-xs bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded-full">
                  Priority #{idx + 1}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-4 flex justify-between">
            <button onClick={() => setCurrentStep(4)} className="text-slate-600 px-4 py-2 font-bold hover:bg-slate-100 rounded-xl">
              Back
            </button>
            <button onClick={() => setCurrentStep(6)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-md flex items-center gap-2">
              Next: Drivers <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: Drivers */}
      {currentStep === 6 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <Car className="w-6 h-6 text-amber-600" />
            <h2 className="text-lg font-bold text-slate-800">6. Auto & Cab Drivers ({driversList.length})</h2>
          </div>

          <div className="space-y-2">
            {driversList.map((d) => (
              <div key={d.id} className="p-3 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800">{d.name} ({d.vehicle_type.toUpperCase()})</h4>
                  <p className="text-xs text-slate-500">{d.phone} • {d.area}</p>
                </div>
                <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">
                  {d.vehicle_type}
                </span>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Driver Name (e.g. Biren Das)"
              value={newDriver.name}
              onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
              className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm"
            />
            <input
              type="text"
              placeholder="Driver Phone"
              value={newDriver.phone}
              onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })}
              className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm"
            />
            <button onClick={addDriver} className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl">
              + Add Driver
            </button>
          </div>

          <div className="pt-4 flex justify-between">
            <button onClick={() => setCurrentStep(5)} className="text-slate-600 px-4 py-2 font-bold hover:bg-slate-100 rounded-xl">
              Back
            </button>
            <button onClick={() => setCurrentStep(7)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-md flex items-center gap-2">
              Next: Medicines <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 7: Medicines */}
      {currentStep === 7 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <Pill className="w-6 h-6 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-800">7. Medicines & Schedules ({medicinesList.length})</h2>
          </div>

          <div className="space-y-2">
            {medicinesList.map((m) => (
              <div key={m.id} className="p-3 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800">{m.name} - {m.dose}</h4>
                  <p className="text-xs text-slate-500">
                    {Array.isArray(m.times_per_day) ? m.times_per_day.join(', ') : 'Daily'} • {m.before_after_food} food
                  </p>
                </div>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                  {m.tablets_remaining} left
                </span>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Medicine Name"
              value={newMedicine.name}
              onChange={(e) => setNewMedicine({ ...newMedicine, name: e.target.value })}
              className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm"
            />
            <input
              type="text"
              placeholder="Dose (e.g. 1 tablet)"
              value={newMedicine.dose}
              onChange={(e) => setNewMedicine({ ...newMedicine, dose: e.target.value })}
              className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm"
            />
            <button onClick={addMedicine} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl">
              + Add Medicine
            </button>
          </div>

          <div className="pt-4 flex justify-between">
            <button onClick={() => setCurrentStep(6)} className="text-slate-600 px-4 py-2 font-bold hover:bg-slate-100 rounded-xl">
              Back
            </button>
            <button onClick={() => setCurrentStep(8)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-md flex items-center gap-2">
              Next: Health Details <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 8: Health Details */}
      {currentStep === 8 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <HeartPulse className="w-6 h-6 text-rose-600" />
            <h2 className="text-lg font-bold text-slate-800">8. Health Details (AES-256 Encrypted)</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Blood Group</label>
              <input
                type="text"
                value={health.bloodGroup}
                onChange={(e) => setHealth({ ...health, bloodGroup: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Allergies</label>
              <input
                type="text"
                value={health.allergies}
                onChange={(e) => setHealth({ ...health, allergies: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Doctor Name</label>
              <input
                type="text"
                value={health.doctorName}
                onChange={(e) => setHealth({ ...health, doctorName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Doctor Phone</label>
              <input
                type="text"
                value={health.doctorPhone}
                onChange={(e) => setHealth({ ...health, doctorPhone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-between">
            <button onClick={() => setCurrentStep(7)} className="text-slate-600 px-4 py-2 font-bold hover:bg-slate-100 rounded-xl">
              Back
            </button>
            <button onClick={saveHealth} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-md flex items-center gap-2">
              Next: Privacy & Consent <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 9: Consent & Review */}
      {currentStep === 9 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-800">9. Privacy, Consent & Final Confirmation</h2>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
              <div>
                <span className="font-bold text-slate-800 block text-sm">Share Location with Caregivers</span>
                <span className="text-xs text-slate-500">Allows emergency geofencing and wandering alerts</span>
              </div>
              <input
                type="checkbox"
                checked={consent.shareLocation}
                onChange={(e) => setConsent({ ...consent, shareLocation: e.target.checked })}
                className="w-5 h-5 text-indigo-600 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
              <div>
                <span className="font-bold text-slate-800 block text-sm">Share Encrypted Health Records</span>
                <span className="text-xs text-slate-500">Accessible during SOS emergency dispatch</span>
              </div>
              <input
                type="checkbox"
                checked={consent.shareHealth}
                onChange={(e) => setConsent({ ...consent, shareHealth: e.target.checked })}
                className="w-5 h-5 text-indigo-600 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
              <div>
                <span className="font-bold text-slate-800 block text-sm">Share Cognitive Game Progress</span>
                <span className="text-xs text-slate-500">Enables weekly observation reports for family</span>
              </div>
              <input
                type="checkbox"
                checked={consent.shareProgress}
                onChange={(e) => setConsent({ ...consent, shareProgress: e.target.checked })}
                className="w-5 h-5 text-indigo-600 rounded"
              />
            </label>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
            <strong>Mandatory Legal Notice:</strong> This app supports memory practice and safety. It does not diagnose or treat dementia or any medical condition. Please consult a doctor for health concerns.
          </div>

          <div className="pt-4 flex justify-between">
            <button onClick={() => setCurrentStep(8)} className="text-slate-600 px-4 py-2 font-bold hover:bg-slate-100 rounded-xl">
              Back
            </button>
            <button
              onClick={completeWizard}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-8 py-3 rounded-xl shadow-lg flex items-center gap-2 text-base"
            >
              Complete Setup & Start <CheckCircle2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
