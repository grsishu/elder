import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, Mic, CheckCircle2, AlertCircle, Heart, Users } from 'lucide-react';

export default function FamilyUpload() {
  const { token } = useParams();
  const [tokenInfo, setTokenInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  // Audio recording state
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);

  useEffect(() => {
    fetch(`/api/wizard/family/upload/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.message);
        setTokenInfo(d.tokenInfo);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
      };
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);

      // Auto stop after 30 seconds
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          setRecording(false);
        }
      }, 30000);
    } catch (e) {
      alert('Microphone access is needed to record a voice message: ' + e.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setRecording(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !relationship || !phone) {
      setError('Please provide your name, relationship, and phone number.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append('name', name);
    formData.append('relationship', relationship);
    formData.append('phone', phone);
    if (photoFile) formData.append('photo', photoFile);
    if (audioBlob) formData.append('voice', audioBlob, 'voice.webm');

    try {
      const res = await fetch(`/api/wizard/family/upload/${token}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-bold text-slate-600">
        Checking upload invitation...
      </div>
    );
  }

  if (error && !tokenInfo) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 bg-rose-50 border border-rose-200 rounded-3xl text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-rose-800 mb-2">Link Expired or Invalid</h2>
        <p className="text-sm text-rose-600">{error}</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 bg-emerald-50 border border-emerald-200 rounded-3xl text-center shadow-lg">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-emerald-800 mb-2">Thank You!</h2>
        <p className="text-sm text-emerald-700 font-medium">
          Your photo and voice greeting have been safely delivered to {tokenInfo?.elder_name || 'your loved one'}'s Smriti Saathi guardian.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto mb-3">
            <Heart className="w-8 h-8 fill-indigo-500 text-indigo-500" />
          </div>
          <h1 className="text-2xl font-black text-slate-800">
            Send Photo & Voice to {tokenInfo?.elder_name || 'Elder'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            This warm greeting will be used in daily memory practice games and emergency cards.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Your Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priyam Barua"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Relationship</label>
              <input
                type="text"
                required
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="e.g. Grandson (पोता)"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Photo of Yourself</label>
            <div className="flex items-center gap-4">
              <label className="cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-300 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-600" /> Choose Photo
                <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
              </label>
              {photoPreview && (
                <img src={photoPreview} alt="Preview" className="w-12 h-12 rounded-full object-cover border" />
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">30-Second Voice Greeting (Audio)</label>
            <div className="flex items-center gap-3">
              {recording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="bg-red-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl animate-pulse"
                >
                  ■ Stop Recording
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2"
                >
                  <Mic className="w-4 h-4" /> {audioBlob ? 'Re-record Voice' : '● Record 30s Voice'}
                </button>
              )}
              {audioBlob && <span className="text-xs text-emerald-600 font-bold">✓ Audio recorded</span>}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-2xl shadow-md text-base"
          >
            {submitting ? 'Submitting...' : 'Submit Photo & Greeting'}
          </button>
        </form>
      </div>
    </div>
  );
}
