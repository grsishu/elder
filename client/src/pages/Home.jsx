import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Gamepad2,
  BellRing,
  PhoneCall,
  Compass,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  Car,
  Globe,
  Volume2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { speak } from '../utils/voice';

export default function Home() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { elder } = useAuth();

  const isHindi = i18n.language.startsWith('hi');
  const elderName = elder?.name || (isHindi ? 'रामेश्वर' : 'Ramesh');

  useEffect(() => {
    // Speak slow greeting upon arriving at Home
    speak(t('home.greeting', { name: elderName }), {
      lang: isHindi ? 'hi' : 'en',
      rate: 0.65,
    });
  }, [elderName, isHindi]);

  const cards = [
    {
      id: 'home-nav-games',
      title: t('home.games_btn'),
      icon: <Gamepad2 className="w-10 h-10 text-violet-700" />,
      color: 'bg-violet-100/90 border-violet-300 text-violet-950 hover:bg-violet-200',
      route: '/games',
    },
    {
      id: 'home-nav-reminders',
      title: t('home.reminders_btn'),
      icon: <BellRing className="w-10 h-10 text-blue-700" />,
      color: 'bg-blue-100/90 border-blue-300 text-blue-950 hover:bg-blue-200',
      route: '/reminders',
    },
    {
      id: 'home-nav-safehome',
      title: t('home.direction_btn'),
      icon: <Compass className="w-10 h-10 text-emerald-700" />,
      color: 'bg-emerald-100/90 border-emerald-300 text-emerald-950 hover:bg-emerald-200',
      route: '/safehome',
    },
    {
      id: 'home-nav-location',
      title: t('home.live_location_btn'),
      icon: <MapPin className="w-10 h-10 text-teal-700" />,
      color: 'bg-teal-100/90 border-teal-300 text-teal-950 hover:bg-teal-200',
      route: '/caregiver/location',
    },
    {
      id: 'home-nav-caregiver',
      title: t('home.caregiver_btn'),
      icon: <ShieldCheck className="w-10 h-10 text-indigo-700" />,
      color: 'bg-indigo-100/90 border-indigo-300 text-indigo-950 hover:bg-indigo-200',
      route: '/caregiver',
    },
    {
      id: 'home-nav-sos',
      title: t('home.sos_btn'),
      icon: <ShieldAlert className="w-10 h-10 text-red-700" />,
      color: 'bg-red-100/90 border-red-300 text-red-950 hover:bg-red-200',
      route: '/sos',
    },
    {
      id: 'home-nav-easyride',
      title: t('home.easyride_btn'),
      icon: <Car className="w-10 h-10 text-amber-700" />,
      color: 'bg-amber-100/90 border-amber-300 text-amber-950 hover:bg-amber-200',
      route: '/easyride',
    },
    {
      id: 'home-nav-family',
      title: t('home.family_btn'),
      icon: <PhoneCall className="w-10 h-10 text-pink-700" />,
      color: 'bg-pink-100/90 border-pink-300 text-pink-950 hover:bg-pink-200',
      route: '/family',
    },
    {
      id: 'home-nav-settings',
      title: t('home.settings_btn'),
      icon: <Globe className="w-10 h-10 text-slate-700" />,
      color: 'bg-slate-100 border-slate-300 text-slate-900 hover:bg-slate-200',
      route: '/settings/language',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28 space-y-6">
      {/* Elder Greeting Banner */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-3xl p-6 md:p-8 text-white shadow-xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-amber-200 text-xs md:text-sm font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>{isHindi ? 'स्मृति साथी • बुजुर्ग रक्षक' : 'Smriti Saathi • AI Guardian'}</span>
          </div>
          <h1 id="home-greeting-heading" className="text-2xl md:text-4xl font-black tracking-tight">
            {t('home.greeting', { name: elderName })}
          </h1>
          <p className="text-amber-100 text-sm md:text-base font-medium pt-1">
            {t('games.encouragement')}
          </p>
        </div>

        <button
          onClick={() =>
            speak(t('home.greeting', { name: elderName }), {
              lang: isHindi ? 'hi' : 'en',
              rate: 0.65,
            })
          }
          className="p-3.5 bg-white/20 hover:bg-white/30 rounded-2xl shrink-0 transition-transform active:scale-95 shadow-md"
          title={isHindi ? 'दोबारा सुनें' : 'Listen again'}
        >
          <Volume2 className="w-7 h-7 text-white" />
        </button>
      </div>

      {/* The 9 Distinct Dashboard Buttons Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <button
            key={card.id}
            id={card.id}
            onClick={() => {
              speak(card.title, { lang: isHindi ? 'hi' : 'en', rate: 0.65 });
              navigate(card.route);
            }}
            className={`btn-elder ${card.color} border-2 p-5 rounded-3xl shadow-sm flex items-center justify-between transition-all hover:scale-[1.02] active:scale-95 text-left`}
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/80 rounded-2xl shadow-sm shrink-0">
                {card.icon}
              </div>
              <div>
                <span className="text-xl sm:text-2xl font-black block leading-tight">
                  {card.title}
                </span>
              </div>
            </div>

            <Volume2 className="w-5 h-5 opacity-40 hover:opacity-100 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
