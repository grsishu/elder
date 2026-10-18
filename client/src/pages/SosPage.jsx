import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, PhoneCall, MapPin, CheckCircle2, AlertOctagon } from 'lucide-react';
import { getCurrentLocation } from '../utils/location';
import { speak } from '../utils/voice';

export default function SosPage() {
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [status, setStatus] = useState('calling'); // calling, resolved
  const [currentLocation, setCurrentLocation] = useState(null);

  useEffect(() => {
    // 1. Get location
    getCurrentLocation()
      .then((loc) => {
        setCurrentLocation(loc);
        return fetch('/api/sos/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            latitude: loc.latitude,
            longitude: loc.longitude,
          }),
        });
      })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setEvent(d.event);
          speak(`Emergency alert dispatched. Calling your emergency contacts now. Stay calm.`, {
            lang: 'en',
            rate: 0.8,
          });
        }
      })
      .catch((e) => console.warn(e));

    // Fetch contacts
    fetch('/api/wizard/state', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.family) {
          setContacts(d.family.filter((f) => f.is_emergency_contact));
        }
      });
  }, []);

  const resolveSos = async () => {
    if (event?.id) {
      await fetch(`/api/sos/${event.id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contactName: 'Elder Safe' }),
      });
    }
    setStatus('resolved');
    speak('Emergency resolved. You are safe.', { lang: 'en', rate: 0.8 });
    setTimeout(() => navigate('/'), 2000);
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-10 text-center">
      <div className="bg-red-600 text-white rounded-3xl p-8 shadow-2xl border-4 border-red-700 animate-pulse mb-6">
        <ShieldAlert className="w-20 h-20 mx-auto mb-4 animate-bounce" />
        <h1 className="text-3xl font-black mb-2">EMERGENCY SOS ACTIVE</h1>
        <p className="text-red-100 text-sm font-semibold max-w-sm mx-auto">
          Help is on the way. Your location and medical emergency details have been sent to your family.
        </p>
      </div>

      {currentLocation && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center gap-2 text-xs font-mono text-slate-600 mb-6">
          <MapPin className="w-4 h-4 text-red-600" />
          <span>
            GPS: {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
          </span>
        </div>
      )}

      {/* Emergency Contacts Escalation List */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm mb-6 text-left">
        <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
          <PhoneCall className="w-5 h-5 text-red-600" /> Calling Emergency Contacts
        </h3>

        <div className="space-y-3">
          {contacts.map((c, i) => (
            <div
              key={c.id || i}
              className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between"
            >
              <div>
                <span className="font-bold text-slate-800 block text-sm">{c.name} ({c.relationship})</span>
                <span className="text-xs text-slate-500">{c.phone}</span>
              </div>
              <a
                href={`tel:${c.phone}`}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
              >
                <PhoneCall className="w-3.5 h-3.5" /> Call Now
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Direct 112 Call */}
      <a
        href="tel:112"
        className="w-full mb-4 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-black py-4 rounded-2xl text-lg flex items-center justify-center gap-2 shadow-lg"
      >
        <PhoneCall className="w-6 h-6" /> Call Police / Ambulance (112)
      </a>

      {/* Cancel / Safe Button */}
      <button
        onClick={resolveSos}
        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl text-sm"
      >
        I Am Safe Now (मैं अब सुरक्षित हूँ)
      </button>
    </div>
  );
}
