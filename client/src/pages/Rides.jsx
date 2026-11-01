import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Car,
  MapPin,
  Phone,
  MessageCircle,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Smile,
  Meh,
  Frown,
  Sparkles,
} from 'lucide-react';
import { getCurrentLocation } from '../utils/location';
import { speak } from '../utils/voice';

export default function Rides() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language.startsWith('hi');

  const [vehicleType, setVehicleType] = useState('auto'); // auto or cab
  const [places, setPlaces] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [currentLoc, setCurrentLoc] = useState(null);
  const [activeRide, setActiveRide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ratingModal, setRatingModal] = useState(false);

  useEffect(() => {
    // Fetch saved places & drivers
    fetch('/api/wizard/state', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.places && d.places.length > 0) {
          setPlaces(d.places);
          setSelectedPlace(d.places[0]);
        }
      })
      .catch(() => {});

    getCurrentLocation().then(setCurrentLoc).catch(() => {});
  }, []);

  const handleRequestRide = async () => {
    if (!selectedPlace) {
      alert(isHindi ? 'कृपया गंतव्य चुनें।' : 'Please choose a destination.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/rides/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          vehicleType,
          pickupAddress: currentLoc ? (isHindi ? 'वर्तमान स्थान' : 'Current GPS Location') : (isHindi ? 'घर का पता' : 'Home Address'),
          pickupLat: currentLoc?.latitude,
          pickupLng: currentLoc?.longitude,
          destAddress: selectedPlace.address || selectedPlace.name,
          destLat: selectedPlace.latitude,
          destLng: selectedPlace.longitude,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setActiveRide(data);

      const msg = isHindi
        ? `${selectedPlace.name} के लिए सवारी का अनुरोध भेजा गया। अनुमानित किराया ₹${data.estimatedFare} है।`
        : `Ride requested to ${selectedPlace.name}. Estimated fare is ₹${data.estimatedFare}.`;

      speak(msg, {
        lang: isHindi ? 'hi' : 'en',
        rate: 0.65,
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRide = async (ratingVal) => {
    if (activeRide?.ride?.id) {
      await fetch(`/api/rides/${activeRide.ride.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rating: ratingVal }),
      });
    }
    setRatingModal(false);
    setActiveRide(null);

    const compMsg = isHindi
      ? 'धन्यवाद! आपकी यात्रा सुरक्षित रूप से पूर्ण हुई।'
      : 'Thank you! Your ride has been safely completed.';

    speak(compMsg, { lang: isHindi ? 'hi' : 'en', rate: 0.65 });
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-2.5 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100 transition"
          aria-label="Back"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
          <Car className="w-7 h-7 text-amber-500" />
          <span>{t('home.easyride_btn')}</span>
        </h1>
        <div className="w-8" />
      </div>

      {!activeRide ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6">
          {/* Vehicle Type Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              {isHindi ? 'वाहन चुनें' : 'Choose Vehicle'}
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setVehicleType('auto')}
                className={`p-5 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                  vehicleType === 'auto'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-md ring-2 ring-amber-300'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-3xl mb-1">🛺</span>
                <span className="font-black text-lg">{t('easyride.auto')}</span>
                <span className="text-[11px] font-semibold text-slate-500">₹30 base + ₹12/km</span>
              </button>

              <button
                onClick={() => setVehicleType('cab')}
                className={`p-5 rounded-2xl border-2 flex flex-col items-center justify-center transition-all ${
                  vehicleType === 'cab'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900 shadow-md ring-2 ring-indigo-300'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <span className="text-3xl mb-1">🚕</span>
                <span className="font-black text-lg">{t('easyride.cab')}</span>
                <span className="text-[11px] font-semibold text-slate-500">₹50 base + ₹18/km</span>
              </button>
            </div>
          </div>

          {/* Destination Cards */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              {isHindi ? 'कहाँ जाना है?' : 'Select Destination'}
            </label>
            <div className="space-y-2.5">
              {places.map((place) => {
                const isSelected = selectedPlace?.id === place.id;
                return (
                  <button
                    key={place.id}
                    onClick={() => setSelectedPlace(place)}
                    className={`w-full p-4 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-xl shadow-xs">
                        <MapPin className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm">{place.name}</h4>
                        <p className="text-xs text-slate-500 line-clamp-1">{place.address}</p>
                      </div>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-amber-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleRequestRide}
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-4 rounded-2xl shadow-lg text-base sm:text-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
          >
            <Car className="w-6 h-6" />
            <span>
              {loading
                ? isHindi
                  ? 'सवारी बुक हो रही है...'
                  : 'Booking Ride...'
                : isHindi
                ? 'सवारी बुक करें'
                : 'Book Ride with Family Driver'}
            </span>
          </button>
        </div>
      ) : (
        /* Active Ride State */
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-6 text-center">
          <div className="w-16 h-16 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center mx-auto text-2xl animate-pulse">
            🛺
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
              {isHindi ? 'सवारी आ रही है' : 'Ride Dispatched'}
            </span>
            <h2 className="text-2xl font-black text-slate-800 mt-1">
              {activeRide.driver?.name || (isHindi ? 'चालक' : 'Trusted Driver')}
            </h2>
            <p className="text-xs text-slate-500">
              {activeRide.driver?.vehicle_type?.toUpperCase()} • {activeRide.driver?.area}
            </p>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between">
            <div className="text-left">
              <span className="text-[10px] font-bold text-slate-400 block">
                {isHindi ? 'अनुमानित किराया' : 'Estimated Fare'}
              </span>
              <span className="text-xl font-black text-slate-800">₹{activeRide.estimatedFare}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 block">
                {isHindi ? 'दूरी' : 'Distance'}
              </span>
              <span className="text-base font-black text-indigo-600">{activeRide.distanceKm} km</span>
            </div>
          </div>

          {/* Contact driver buttons */}
          <div className="grid grid-cols-2 gap-3">
            {activeRide.callLink && (
              <a
                href={activeRide.callLink}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-sm"
              >
                <Phone className="w-4 h-4" />
                <span>{t('easyride.call_driver')}</span>
              </a>
            )}
            {activeRide.whatsappLink && (
              <a
                href={activeRide.whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-sm"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
            )}
          </div>

          <button
            onClick={() => setRatingModal(true)}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-2xl text-sm"
          >
            {isHindi ? 'सवारी पूर्ण हुई' : 'Trip Completed'}
          </button>
        </div>
      )}

      {/* 3-Face Rating Modal */}
      {ratingModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl">
            <h3 className="text-xl font-black text-slate-800 mb-6">
              {isHindi ? 'आपकी यात्रा कैसी रही?' : 'How was your ride?'}
            </h3>

            <div className="flex justify-around mb-6">
              <button
                onClick={() => handleCompleteRide(1)}
                className="p-4 rounded-2xl hover:bg-rose-50 text-rose-500 flex flex-col items-center gap-1 transition-transform active:scale-90"
              >
                <Frown className="w-12 h-12" />
                <span className="text-xs font-bold">
                  {isHindi ? 'असुविधाजनक' : 'Uncomfortable'}
                </span>
              </button>
              <button
                onClick={() => handleCompleteRide(2)}
                className="p-4 rounded-2xl hover:bg-amber-50 text-amber-500 flex flex-col items-center gap-1 transition-transform active:scale-90"
              >
                <Meh className="w-12 h-12" />
                <span className="text-xs font-bold">{isHindi ? 'सामान्य' : 'Okay'}</span>
              </button>
              <button
                onClick={() => handleCompleteRide(3)}
                className="p-4 rounded-2xl hover:bg-emerald-50 text-emerald-500 flex flex-col items-center gap-1 transition-transform active:scale-90"
              >
                <Smile className="w-12 h-12" />
                <span className="text-xs font-bold">{isHindi ? 'बहुत अच्छा' : 'Great!'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
