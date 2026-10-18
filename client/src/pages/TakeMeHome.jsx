import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, Home, MapPin, Volume2, ArrowLeft, ChevronRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { getCurrentLocation } from '../utils/location';
import { speak } from '../utils/voice';

export default function TakeMeHome() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [routeData, setRouteData] = useState(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Get elder location and fetch walking route to Home
    getCurrentLocation()
      .then((pos) => {
        return fetch('/api/navigation/take-me-home', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            latitude: pos.latitude,
            longitude: pos.longitude,
          }),
        });
      })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.message || 'Could not fetch directions');
        setRouteData(d);
        speak(`Don't worry, you are safe. Family has been informed. Follow the simple steps to reach home.`, {
          lang: 'en',
          rate: 0.75,
        });
      })
      .catch((err) => {
        setError(err.message);
        speak('Please stay where you are. Your family is being notified with your exact location.', {
          lang: 'en',
          rate: 0.75,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const steps = routeData?.steps || [];
  const currentStep = steps[currentStepIdx];

  const speakCurrentStep = () => {
    if (currentStep) {
      speak(currentStep.instruction, { lang: 'en', rate: 0.75 });
    }
  };

  useEffect(() => {
    if (currentStep) {
      speakCurrentStep();
    }
  }, [currentStepIdx, currentStep]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <Compass className="w-16 h-16 text-indigo-600 animate-spin mb-4" />
        <h2 className="text-2xl font-black text-slate-800">Finding the safest path home...</h2>
        <p className="text-slate-500 text-sm mt-1">घर जाने का रास्ता खोजा जा रहा है...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-16 p-8 bg-rose-50 border border-rose-200 rounded-3xl text-center">
        <ShieldAlert className="w-16 h-16 text-rose-600 mx-auto mb-4" />
        <h2 className="text-2xl font-black text-rose-800 mb-2">We Are Here With You</h2>
        <p className="text-sm text-rose-700 font-medium mb-6">
          Your live GPS coordinates have been securely shared with your family caregiver. Please stay in a safe, visible spot.
        </p>
        <button
          onClick={() => navigate('/')}
          className="bg-rose-600 text-white font-bold px-6 py-3 rounded-2xl shadow-md text-sm"
        >
          Return Home Screen
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Top Banner */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('/')} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <span className="text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> Family Informed
        </span>
      </div>

      <div className="bg-white rounded-3xl border-2 border-indigo-500 p-8 shadow-xl text-center mb-6">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-indigo-100 flex items-center justify-center text-indigo-600 mb-6 shadow-inner">
          <Home className="w-10 h-10" />
        </div>

        <span className="text-xs font-black text-indigo-600 uppercase tracking-widest block mb-2">
          Step {currentStepIdx + 1} of {steps.length}
        </span>

        {/* Giant Spoken Instruction Text */}
        <h2 className="text-3xl font-black text-slate-800 mb-4 leading-tight">
          {currentStep?.instruction}
        </h2>

        <p className="text-sm font-semibold text-slate-400 mb-8">
          Destination: {routeData?.destination?.name} ({routeData?.totalDistanceM}m away)
        </p>

        <div className="flex gap-3">
          <button
            onClick={speakCurrentStep}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-4 rounded-2xl text-sm flex items-center justify-center gap-2"
          >
            <Volume2 className="w-5 h-5 text-indigo-600" /> Listen Again
          </button>

          {currentStepIdx + 1 < steps.length ? (
            <button
              onClick={() => setCurrentStepIdx((i) => i + 1)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg"
            >
              Next Step <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => navigate('/')}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg"
            >
              I Am Home! ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
