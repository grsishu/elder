import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Gamepad2,
  BellRing,
  Heart,
  Navigation,
  Car,
  ShieldAlert,
  Volume2,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { speak } from '../utils/voice';

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { elder } = useAuth();

  const elderName = elder?.name || 'Ramesh';

  useEffect(() => {
    // Speak slow greeting upon arriving at Home
    speak(t('home.greeting', { name: elderName }));
  }, [elderName, t]);

  const cards = [
    {
      id: 'home-nav-games',
      title: t('home.games_btn'),
      icon: <Gamepad2 className="w-12 h-12 text-violet-700" />,
      color: 'bg-violet-100 border-violet-300 text-violet-950 hover:bg-violet-200',
      route: '/games',
      desc: '6 fun memory exercises',
    },
    {
      id: 'home-nav-reminders',
      title: t('home.reminders_btn'),
      icon: <BellRing className="w-12 h-12 text-blue-700" />,
      color: 'bg-blue-100 border-blue-300 text-blue-950 hover:bg-blue-200',
      route: '/reminders',
      desc: 'Medicines and water',
    },
    {
      id: 'home-nav-family',
      title: t('home.family_btn'),
      icon: <Heart className="w-12 h-12 text-pink-700" />,
      color: 'bg-pink-100 border-pink-300 text-pink-950 hover:bg-pink-200',
      route: '/family',
      desc: 'Photos, voices & calls',
    },
    {
      id: 'home-nav-lost',
      title: t('home.lost_btn'),
      icon: <Navigation className="w-12 h-12 text-emerald-700" />,
      color: 'bg-emerald-100 border-emerald-300 text-emerald-950 hover:bg-emerald-200',
      route: '/lost',
      desc: 'Walking directions home',
    },
    {
      id: 'home-nav-easyride',
      title: t('home.easyride_btn'),
      icon: <Car className="w-12 h-12 text-amber-700" />,
      color: 'bg-amber-100 border-amber-300 text-amber-950 hover:bg-amber-200',
      route: '/easyride',
      desc: 'Auto & cab drivers',
    },
    {
      id: 'home-nav-sos',
      title: t('home.sos_btn'),
      icon: <ShieldAlert className="w-12 h-12 text-red-700" />,
      color: 'bg-red-100 border-red-300 text-red-950 hover:bg-red-200',
      route: '/sos',
      desc: 'Emergency family alert',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-32 space-y-6">
      {/* Elder Greeting Banner */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-3xl p-6 md:p-8 text-white shadow-xl flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-amber-200 text-sm md:text-base font-bold">
            <Sparkles className="w-5 h-5" />
            <span>Smriti Saathi</span>
          </div>
          <h1 id="home-greeting-heading" className="text-3xl md:text-5xl font-black tracking-tight">
            {t('home.greeting', { name: elderName })}
          </h1>
          <p className="text-amber-100 text-lg md:text-xl font-medium pt-1">
            {t('games.encouragement')}
          </p>
        </div>

        <button
          onClick={() => speak(t('home.greeting', { name: elderName }))}
          className="p-4 bg-white/20 hover:bg-white/30 rounded-2xl shrink-0 transition-transform active:scale-95 shadow-md"
          title={t('common.hear_again')}
        >
          <Volume2 className="w-8 h-8 text-white" />
        </button>
      </div>

      {/* The 6 Big Buttons Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {cards.map((card) => (
          <button
            key={card.id}
            id={card.id}
            onClick={() => {
              speak(card.title);
              navigate(card.route);
            }}
            className={`btn-elder ${card.color} border-3 p-6 rounded-3xl shadow-lg flex items-center justify-between transition-all hover:scale-[1.02] active:scale-95 text-left`}
          >
            <div className="flex items-center gap-5">
              <div className="p-3 bg-white/70 rounded-2xl shadow-sm">
                {card.icon}
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-black block">
                  {card.title}
                </span>
                <span className="text-sm font-semibold opacity-75 block mt-0.5">
                  {card.desc}
                </span>
              </div>
            </div>

            <Volume2 className="w-7 h-7 opacity-60 hover:opacity-100 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
