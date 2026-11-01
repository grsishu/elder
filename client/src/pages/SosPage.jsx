import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, PhoneCall, MapPin, CheckCircle2, AlertOctagon, ArrowLeft } from 'lucide-react';
import { getCurrentLocation } from '../utils/location';
import { speak } from '../utils/voice';

export default function SosPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language.startsWith('hi');

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
          const alertVoice = isHindi
            ? 'आपातकालीन सूचना भेज दी गई है। परिजनों को कॉल किया जा रहा है। शांत रहें।'
            : 'Emergency alert dispatched. Calling your emergency contacts now. Stay calm.';
          speak(alertVoice, {
            lang: isHindi ? 'hi' : 'en',
            rate: 0.65,
          });
        }
      })
      .catch((e) => console.warn(e));

    // 2. Fetch emergency contacts
    fetch('/api/wizard/state', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.family) {
          const em = d.family.filter((f) => f.is_emergency_contact);
          setContacts(em.length > 0 ? em : d.family);
        }
      })
      .catch(() => {});
  }, [isHindi]);

  const resolveSos = async () => {
    if (event?.id) {
      await fetch(`/api/sos/${event.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ outcome: 'elder_cancelled' }),
      });
    }
    const safeVoice = isHindi
      ? 'आपातकाल समाप्त कर दिया गया है। आप सुरक्षित हैं।'
      : 'Emergency alert resolved. You are safe.';
    speak(safeVoice, { lang: isHindi ? 'hi' : 'en', rate: 0.65 });
    navigate('/');
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Top Banner */}
      <div className="bg-rose-600 text-white p-6 rounded-3xl shadow-xl flex items-center justify-between mb-8 animate-pulse">
        <div className="flex items-center gap-4">
          <AlertOctagon className="w-12 h-12 stroke-[2.5]" />
          <div>
            <h1 className="text-2xl font-black">
              {isHindi ? 'आपातकालीन सहायता सक्रिय' : 'EMERGENCY SOS ACTIVE'}
            </h1>
            <p className="text-xs text-rose-100 font-semibold mt-0.5">
              {isHindi ? 'लाइव जीपीएस परिवार के साथ साझा किया गया' : 'Live GPS location shared with family'}
            </p>
          </div>
        </div>
      </div>

      {/* Emergency Contacts List */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm mb-6">
        <h2 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
          <PhoneCall className="w-5 h-5 text-rose-600" />
          <span>{isHindi ? 'आपातकालीन संपर्कों को कॉल' : 'Calling Emergency Contacts'}</span>
        </h2>

        <div className="space-y-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200 flex items-center justify-between"
            >
              <div>
                <span className="text-xs font-bold text-rose-600 block uppercase">
                  {contact.relationship || (isHindi ? 'परिजन' : 'Family Member')}
                </span>
                <h3 className="font-black text-slate-800 text-lg">{contact.name}</h3>
                <p className="text-xs text-slate-500 font-mono">{contact.phone}</p>
              </div>

              <a
                href={`tel:${contact.phone}`}
                className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-3 rounded-xl font-black text-xs flex items-center gap-2 shadow-sm transition"
              >
                <PhoneCall className="w-4 h-4" />
                <span>{isHindi ? 'अभी कॉल करें' : 'Call Now'}</span>
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Direct 112 Call */}
      <a
        href="tel:112"
        className="w-full mb-4 bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-black py-4 rounded-2xl text-base sm:text-lg flex items-center justify-center gap-2 shadow-lg transition"
      >
        <PhoneCall className="w-6 h-6" />
        <span>{isHindi ? 'पुलिस / एम्बुलेंस (112) को कॉल करें' : 'Call Police / Ambulance (112)'}</span>
      </a>

      {/* Cancel / Safe Button */}
      <button
        onClick={resolveSos}
        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-2xl text-sm transition"
      >
        {isHindi ? 'मैं अब सुरक्षित हूँ' : 'I Am Safe Now'}
      </button>
    </div>
  );
}
