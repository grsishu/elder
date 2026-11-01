import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, ArrowLeft, Check, Volume2, Sparkles } from 'lucide-react';
import { speak } from '../utils/voice';

const ALL_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', desc: 'Complete pure English interface and voice assistance.' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', desc: 'सभी स्क्रीन और आवाज नेविगेशन पूर्ण रूप से हिन्दी में।' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', desc: 'அனைத்து திரைகள் மற்றும் குரல் வழிகாட்டல் தமிழில்.' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', desc: 'সকলো পৃষ্ঠা আৰু ভইচ সহায় অসমীয়াত।' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', desc: 'সমস্ত স্ক্রিন ও ভয়েস সহায়তা বাংলায়।' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', desc: 'అన్ని స్క్రీన్లు మరియు వాయిస్ సహాయం తెలుగులో.' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', desc: 'എല്ലാ സ്ക്രീനുകളും ശബ്ദ സഹായവും മലയാളത്തിൽ.' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', desc: 'ಎಲ್ಲಾ ಪರದೆಗಳು ಮತ್ತು ಧ್ವನಿ ಮಾರ್ಗದರ್ಶನ ಕನ್ನಡದಲ್ಲಿ.' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', desc: 'सर्व स्क्रीन आणि आवाज मार्गदर्शन मराठीत.' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', desc: 'બધી સ્ક્રીનો અને અવાજ સહાય ગુજરાતીમાં.' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', desc: 'ସମସ୍ତ ସ୍କ୍ରିନ୍ ଏବଂ ଭଏସ୍ ସହାୟତା ଓଡ଼ିଆରେ।' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', desc: 'ਸਾਰੀਆਂ ਸਕ੍ਰੀਨਾਂ ਅਤੇ ਆਵਾਜ਼ ਸਹਾਇਤਾ ਪੰਜਾਬੀ ਵਿੱਚ।' },
  { code: 'ur', name: 'Urdu', native: 'اردو', desc: 'تمام اسکرینیں اور صوتی معاونت اردو میں۔' },
];

export default function LanguageSettings() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState(i18n.language || 'en');
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSelectLanguage = (lang) => {
    setSelected(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem('i18nextLng', lang);
    localStorage.setItem('smriti_language', lang);
    localStorage.setItem('smriti_elder_language', lang);

    const testMsg =
      lang === 'hi'
        ? 'भाषा हिन्दी चुन ली गई है। स्मृति साथी में आपका स्वागत है।'
        : lang === 'ta'
        ? 'ஸ்மிருதி சாத்திக்கு உங்களை வரவேற்கிறோம்.'
        : lang === 'bn'
        ? 'স্মৃতি সাথীতে আপনাকে স্বাগতম।'
        : 'Language updated. Welcome to Smriti Saathi.';

    speak(testMsg, {
      lang,
      speed: 0.65,
    });

    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);

    // Save preference to server if logged in
    fetch('/api/elder/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ language: lang }),
    }).catch(() => {});
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => navigate('/')}
          className="p-2.5 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100 transition"
          aria-label="Back"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2.5">
          <Globe className="w-7 h-7 text-indigo-600" />
          <span>{t('auth.choose_language', 'Choose Your Language')} (13 Languages)</span>
        </h1>

        <div className="w-10" />
      </div>

      {savedNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-center font-bold text-sm mb-6 animate-fade-in flex items-center justify-center gap-2">
          <Check className="w-5 h-5 text-emerald-600" />
          <span>Language updated successfully across the entire platform</span>
        </div>
      )}

      {/* Language Options Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        {ALL_LANGUAGES.map((lang) => {
          const isSelected = selected === lang.code;
          return (
            <button
              key={lang.code}
              onClick={() => handleSelectLanguage(lang.code)}
              className={`p-4 rounded-2xl border-2 text-left transition flex items-center justify-between shadow-sm ${
                isSelected
                  ? 'bg-indigo-50 border-indigo-600 text-indigo-950'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
              }`}
            >
              <div>
                <span className="text-[10px] uppercase font-black tracking-wider text-indigo-600 block mb-0.5">
                  {lang.name}
                </span>
                <h3 className="text-lg font-black">{lang.native}</h3>
                <p className="text-slate-500 text-[11px] font-medium line-clamp-1">{lang.desc}</p>
              </div>
              {isSelected && (
                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Done Button */}
      <div>
        <button
          onClick={() => navigate('/')}
          className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-base shadow-md transition"
        >
          {t('common.done', 'Save and Return to Dashboard')}
        </button>
      </div>
    </div>
  );
}
