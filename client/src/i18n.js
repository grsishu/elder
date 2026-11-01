import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import hi from './locales/hi.json';
import ta from './locales/ta.json';
import as from './locales/as.json';
import bn from './locales/bn.json';
import te from './locales/te.json';
import ml from './locales/ml.json';
import kn from './locales/kn.json';
import mr from './locales/mr.json';
import gu from './locales/gu.json';
import or from './locales/or.json';
import pa from './locales/pa.json';
import ur from './locales/ur.json';

const savedLang =
  localStorage.getItem('smriti_elder_language') ||
  localStorage.getItem('smriti_language') ||
  'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    ta: { translation: ta },
    as: { translation: as },
    bn: { translation: bn },
    te: { translation: te },
    ml: { translation: ml },
    kn: { translation: kn },
    mr: { translation: mr },
    gu: { translation: gu },
    or: { translation: or },
    pa: { translation: pa },
    ur: { translation: ur },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
