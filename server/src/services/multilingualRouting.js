/**
 * Multilingual Routing and Step Generator
 * Converts routing maneuvers and distances into simple, clear instructions
 * across 13 Indian languages for elderly users.
 */

const MANEUVER_TRANSLATIONS = {
  en: {
    depart: (dist, name) => name ? `Walk ${dist}m on ${name}.` : `Walk ${dist} meters.`,
    straight: (dist, name) => name ? `Continue straight on ${name} for ${dist}m.` : `Continue straight for ${dist}m.`,
    turn_left: (dist, name) => name ? `Turn left onto ${name}. Walk ${dist}m.` : `Turn left. Walk ${dist}m.`,
    turn_right: (dist, name) => name ? `Turn right onto ${name}. Walk ${dist}m.` : `Turn right. Walk ${dist}m.`,
    uturn: (dist) => `Make a U-turn and walk ${dist}m.`,
    cross: () => `Carefully cross the road.`,
    arrive: (name) => `You have arrived at ${name || 'your destination'}.`,
    destination_ahead: (dist, name) => `${name || 'Destination'} is ${dist}m ahead.`,
  },
  hi: {
    depart: (dist, name) => name ? `${name} पर ${dist} मीटर चलें।` : `${dist} मीटर सीधे चलें।`,
    straight: (dist, name) => name ? `${name} पर ${dist} मीटर सीधे चलते रहें।` : `${dist} मीटर सीधे चलते रहें।`,
    turn_left: (dist, name) => name ? `बाएँ मुड़ें ${name} पर। ${dist} मीटर चलें।` : `बाएँ मुड़ें। ${dist} मीटर चलें।`,
    turn_right: (dist, name) => name ? `दाएँ मुड़ें ${name} पर। ${dist} मीटर चलें।` : `दाएँ मुड़ें। ${dist} मीटर चलें।`,
    uturn: (dist) => `यू-टर्न लें और ${dist} मीटर चलें।`,
    cross: () => `सावधानी से सड़क पार करें।`,
    arrive: (name) => `आप ${name || 'अपनी मंज़िल'} पहुँच गए हैं।`,
    destination_ahead: (dist, name) => `${name || 'मंज़िल'} ${dist} मीटर आगे है।`,
  },
  ta: {
    depart: (dist, name) => name ? `${name} வழியே ${dist} மீ நடக்கவும்.` : `${dist} மீட்டர்கள் நேராக நடக்கவும்.`,
    straight: (dist, name) => name ? `${name} வழியே ${dist} மீ தொடர்ந்து செல்லவும்.` : `${dist} மீ நேராக நடக்கவும்.`,
    turn_left: (dist, name) => name ? `இடதுபுறம் திரும்பவும் (${name}). ${dist} மீ நடக்கவும்.` : `இடதுபுறம் திரும்பி ${dist} மீ நடக்கவும்.`,
    turn_right: (dist, name) => name ? `வலதுபுறம் திரும்பவும் (${name}). ${dist} மீ நடக்கவும்.` : `வலதுபுறம் திரும்பி ${dist} மீ நடக்கவும்.`,
    uturn: (dist) => `யு-டர்ன் எடுத்து ${dist} மீ நடக்கவும்.`,
    cross: () => `சாலையைக் கவனமாகக் கடக்கவும்.`,
    arrive: (name) => `நீங்கள் ${name || 'உங்கள் இலக்கை'} அடைந்துவிட்டீர்கள்.`,
    destination_ahead: (dist, name) => `${name || 'இலக்கு'} ${dist} மீ தூரத்தில் உள்ளது.`,
  },
  as: {
    depart: (dist, name) => name ? `${name} হৈ ${dist} মিটাৰ খোজ কাঢ়ক।` : `${dist} মিটাৰ চিধাই খোজ কাঢ়ক।`,
    straight: (dist, name) => name ? `${name} হৈ ${dist} মিটাৰ আগবাঢ়ক।` : `${dist} মিটাৰ চিধাই আগবাঢ়ক।`,
    turn_left: (dist, name) => name ? `বাওঁফালে ঘূৰক (${name})। ${dist} মিটাৰ চলক।` : `বাওঁফালে ঘূৰি ${dist} মিটাৰ চলক।`,
    turn_right: (dist, name) => name ? `সোঁফালে ঘূৰক (${name})। ${dist} মিটাৰ চলক।` : `সোঁফালে ঘূৰি ${dist} মিটাৰ চলক।`,
    uturn: (dist) => `ইউ-টাৰ্ন লৈ ${dist} মিটাৰ চলক।`,
    cross: () => `সাৱধানে ৰাস্তা পাৰ হওক।`,
    arrive: (name) => `আপুনি ${name || 'গন্তব্যস্থান'} পালেহি।`,
    destination_ahead: (dist, name) => `${name || 'গন্তব্যস্থান'} ${dist} মিটাৰ আগত আছে।`,
  },
  bn: {
    depart: (dist, name) => name ? `${name} ধরে ${dist} মিটার হাঁটুন।` : `${dist} মিটার সোজা হাঁটুন।`,
    straight: (dist, name) => name ? `${name} দিয়ে ${dist} মিটার এগিয়ে চলুন।` : `${dist} মিটার সোজা এগিয়ে চলুন।`,
    turn_left: (dist, name) => name ? `বাঁ দিকে ঘুরুন (${name})। ${dist} মিটার হাঁটুন।` : `বাঁ দিকে ঘুরে ${dist} মিটার হাঁটুন।`,
    turn_right: (dist, name) => name ? `ডান দিকে ঘুরুন (${name})। ${dist} মিটার হাঁটুন।` : `ডান দিকে ঘুরে ${dist} মিটার হাঁটুন।`,
    uturn: (dist) => `ইউ-টার্ন নিয়ে ${dist} মিটার হাঁটুন।`,
    cross: () => `সাবধানে রাস্তা পার হোন।`,
    arrive: (name) => `আপনি ${name || 'গন্তব্যে'} পৌঁছে গেছেন।`,
    destination_ahead: (dist, name) => `${name || 'গন্তব্য'} ${dist} মিটার সামনে আছে।`,
  },
  te: {
    depart: (dist, name) => name ? `${name} గుండా ${dist} మీటర్లు నడవండి.` : `${dist} మీటర్లు నేరుగా నడవండి.`,
    straight: (dist, name) => name ? `${name} లో ${dist} మీటర్లు ముందుకు సాగండి.` : `${dist} మీటర్లు ముందుకు సాగండి.`,
    turn_left: (dist, name) => name ? `ఎడమవైపు తిరగండి (${name}). ${dist} మీ నడవండి.` : `ఎడమవైపు తిరిగి ${dist} మీటర్లు నడవండి.`,
    turn_right: (dist, name) => name ? `కుడివైపు తిరగండి (${name}). ${dist} మీ నడవండి.` : `కుడివైపు తిరిగి ${dist} మీటర్లు నడవండి.`,
    uturn: (dist) => `యు-టర్న్ తీసుకుని ${dist} మీ నడవండి.`,
    cross: () => `జాగ్రత్తగా రోడ్డు దాటండి.`,
    arrive: (name) => `మీరు ${name || 'గమ్యస్థానానికి'} చేరుకున్నారు.`,
    destination_ahead: (dist, name) => `${name || 'గమ్యం'} ${dist} మీటర్ల ముందు ఉంది.`,
  },
  ml: {
    depart: (dist, name) => name ? `${name} വഴി ${dist} മീറ്റർ നടക്കുക.` : `${dist} മീറ്റർ നേരെ നടക്കുക.`,
    straight: (dist, name) => name ? `${name} വഴി ${dist} മീറ്റർ മുന്നോട്ട് പോവുക.` : `${dist} മീറ്റർ നേരെ പോവുക.`,
    turn_left: (dist, name) => name ? `ഇടത്തോട്ട് തിരിയുക (${name}). ${dist} മീ നടക്കുക.` : `ഇടത്തോട്ട് തിരിഞ്ഞ് ${dist} മീറ്റർ നടക്കുക.`,
    turn_right: (dist, name) => name ? `വലത്തോട്ട് തിരിയുക (${name}). ${dist} മീ നടക്കുക.` : `വലത്തോട്ട് തിരിഞ്ഞ് ${dist} മീറ്റർ നടക്കുക.`,
    uturn: (dist) => `യു-ടേൺ എടുത്ത് ${dist} മീറ്റർ നടക്കുക.`,
    cross: () => `ശ്രദ്ധയോടെ റോഡ് മുറിച്ചുകടക്കുക.`,
    arrive: (name) => `നിങ്ങൾ ${name || 'ലക്ഷ്യസ്ഥാനത്ത്'} എത്തിച്ചേർന്നു.`,
    destination_ahead: (dist, name) => `${name || 'ലക്ഷ్యం'} ${dist} മീറ്റർ മുന്നിലാണ്.`,
  },
  kn: {
    depart: (dist, name) => name ? `${name} ಮೂಲಕ ${dist} ಮೀಟರ್ ನಡೆಯಿರಿ.` : `${dist} ಮೀಟರ್ ನೇರವಾಗಿ ನಡೆಯಿರಿ.`,
    straight: (dist, name) => name ? `${name} ನಲ್ಲಿ ${dist} ಮೀಟರ್ ಮುಂದುವರಿಯಿರಿ.` : `${dist} ಮೀಟರ್ ನೇರವಾಗಿ ಮುಂದುವರಿಯಿರಿ.`,
    turn_left: (dist, name) => name ? `ಎಡಕ್ಕೆ ತಿರುಗಿ (${name}). ${dist} ಮೀ ನಡೆಯಿರಿ.` : `ಎಡಕ್ಕೆ ತಿರುಗಿ ${dist} ಮೀಟರ್ ನಡೆಯಿರಿ.`,
    turn_right: (dist, name) => name ? `ಬಲಕ್ಕೆ ತಿರುಗಿ (${name}). ${dist} ಮೀ ನಡೆಯಿರಿ.` : `ಬಲಕ್ಕೆ ತಿರುಗಿ ${dist} ಮೀಟರ್ ನಡೆಯಿರಿ.`,
    uturn: (dist) => `ಯು-ಟರ್ನ್ ತೆಗೆದುಕೊಂಡು ${dist} ಮೀಟರ್ ನಡೆಯಿರಿ.`,
    cross: () => `ಎಚ್ಚರಿಕೆಯಿಂದ ರಸ್ತೆ ದಾಟಿ.`,
    arrive: (name) => `ನೀವು ${name || 'ಗಮ್ಯಸ್ಥಾನವನ್ನು'} ತಲುಪಿದ್ದೀರಿ.`,
    destination_ahead: (dist, name) => `${name || 'ಗಮ್ಯಸ್ಥಾನ'} ${dist} ಮೀಟರ್ ಮುಂದಿದೆ.`,
  },
  mr: {
    depart: (dist, name) => name ? `${name} वरून ${dist} मीटर चाला.` : `${dist} मीटर सरळ चाला.`,
    straight: (dist, name) => name ? `${name} वर ${dist} मीटर पुढे जा.` : `${dist} मीटर सरळ पुढे जा.`,
    turn_left: (dist, name) => name ? `डावीकडे वळा (${name}). ${dist} मीटर चाला.` : `डावीकडे वळून ${dist} मीटर चाला.`,
    turn_right: (dist, name) => name ? `उजवीकडे वळा (${name}). ${dist} मीटर चाला.` : `उजवीकडे वळून ${dist} मीटर चाला.`,
    uturn: (dist) => `यू-टर्न घ्या आणि ${dist} मीटर चाला.`,
    cross: () => `रस्ता काळजीपूर्वक ओलांडा.`,
    arrive: (name) => `तुम्ही ${name || 'ठिकाणी'} पोहोचला आहात.`,
    destination_ahead: (dist, name) => `${name || 'गंतव्य'} ${dist} मीटर समोर आहे.`,
  },
  gu: {
    depart: (dist, name) => name ? `${name} પર ${dist} મીટર ચાલો.` : `${dist} મીટર સીધા ચાલો.`,
    straight: (dist, name) => name ? `${name} પર ${dist} મીટર આગળ વધો.` : `${dist} મીટર સીધા આગળ વધો.`,
    turn_left: (dist, name) => name ? `ડાબે વળો (${name}). ${dist} મીટર ચાલો.` : `ડાબે વળીને ${dist} મીટર ચાલો.`,
    turn_right: (dist, name) => name ? `જમણે વળો (${name}). ${dist} મીટર ચાલો.` : `જમણે વળીને ${dist} મીટર ચાલો.`,
    uturn: (dist) => `યુ-ટર્ન લો અને ${dist} મીટર ચાલો.`,
    cross: () => `સાવધાનીપૂર્વક રસ્તો ઓળંગો.`,
    arrive: (name) => `તમે ${name || 'ગંતવ્ય પર'} પહોંચી ગયા છો.`,
    destination_ahead: (dist, name) => `${name || 'ગંતવ્ય'} ${dist} મીટર આગળ છે.`,
  },
  or: {
    depart: (dist, name) => name ? `${name} ଦେଇ ${dist} ମିଟର ଚାଲନ୍ତୁ।` : `${dist} ମିଟର ସିଧା ଚାଲନ୍ତୁ।`,
    straight: (dist, name) => name ? `${name} ରେ ${dist} ମିଟର ଆଗକୁ ବଢ଼ନ୍ତୁ।` : `${dist} ମିଟର ସିଧା ଆଗକୁ ବଢ଼ନ୍ତୁ।`,
    turn_left: (dist, name) => name ? `ବାମକୁ ବୁଲନ୍ତୁ (${name})। ${dist} ମି ଚାଲନ୍ତୁ।` : `ବାମକୁ ବୁଲି ${dist} ମିଟର ଚାଲନ୍ତୁ।`,
    turn_right: (dist, name) => name ? `ଡାହାଣକୁ ବୁଲନ୍ତୁ (${name})। ${dist} ମି ଚାଲନ୍ତୁ।` : `ଡାହାଣକୁ ବୁଲି ${dist} ମିଟର ଚାଲନ୍ତୁ।`,
    uturn: (dist) => `ୟୁ-ଟର୍ଣ୍ଣ ନେଇ ${dist} ମିଟର ଚାଲନ୍ତୁ।`,
    cross: () => `ସତର୍କତାର ସହିତ ରାସ୍ତା ପାର ହୁଅନ୍ତୁ।`,
    arrive: (name) => `ଆପଣ ${name || 'ଗନ୍ତବ୍ୟସ୍ଥଳରେ'} ପହଞ୍ଚିଗଲେ।`,
    destination_ahead: (dist, name) => `${name || 'ଗନ୍ତବ୍ୟସ୍ଥଳ'} ${dist} ମିଟର ସାମ୍ନାରେ ଅଛି।`,
  },
  pa: {
    depart: (dist, name) => name ? `${name} 'ਤੇ ${dist} ਮੀਟਰ ਤੁਰੋ।` : `${dist} ਮੀਟਰ ਸਿੱਧਾ ਤੁਰੋ।`,
    straight: (dist, name) => name ? `${name} 'ਤੇ ${dist} ਮੀਟਰ ਅੱਗੇ ਵਧੋ।` : `${dist} ਮੀਟਰ ਸਿੱਧਾ ਅੱਗੇ ਵਧੋ।`,
    turn_left: (dist, name) => name ? `ਖੱਬੇ ਮੁੜੋ (${name})। ${dist} ਮੀਟਰ ਤੁਰੋ।` : `ਖੱਬੇ ਮੁੜ ਕੇ ${dist} ਮੀਟਰ ਤੁਰੋ।`,
    turn_right: (dist, name) => name ? `ਸੱਜੇ ਮੁੜੋ (${name})। ${dist} ਮੀਟਰ ਤੁਰੋ।` : `ਸੱਜੇ ਮੁੜ ਕੇ ${dist} ਮੀਟਰ ਤੁਰੋ।`,
    uturn: (dist) => `ਯੂ-ਟਰਨ ਲਓ ਅਤੇ ${dist} ਮੀਟਰ ਤੁਰੋ।`,
    cross: () => `ਸਾਵਧਾਨੀ ਨਾਲ ਸੜਕ ਪਾਰ ਕਰੋ।`,
    arrive: (name) => `ਤੁਸੀਂ ${name || 'ਮੰਜ਼ਿਲ'} 'ਤੇ ਪਹੁੰਚ ਗਏ ਹੋ।`,
    destination_ahead: (dist, name) => `${name || 'ਮੰਜ਼ਿਲ'} ${dist} ਮੀਟਰ ਅੱਗੇ ਹੈ।`,
  },
  ur: {
    depart: (dist, name) => name ? `${name} پر ${dist} میٹر چلیں۔` : `${dist} میٹر سیدھے چلیں۔`,
    straight: (dist, name) => name ? `${name} پر ${dist} میٹر سیدھے چلتے رہیں۔` : `${dist} میٹر سیدھے چلتے رہیں۔`,
    turn_left: (dist, name) => name ? `بائیں مڑیں (${name})۔ ${dist} میٹر چلیں۔` : `بائیں مڑ کر ${dist} میٹر چلیں۔`,
    turn_right: (dist, name) => name ? `دائیں مڑیں (${name})۔ ${dist} میٹر چلیں۔` : `دائیں مڑ کر ${dist} میٹر چلیں۔`,
    uturn: (dist) => `یو ٹرن لیں اور ${dist} میٹر چلیں۔`,
    cross: () => `احتیاط سے سڑک پار کریں۔`,
    arrive: (name) => `آپ ${name || 'منزل'} پر پہنچ گئے ہیں۔`,
    destination_ahead: (dist, name) => `${name || 'منزل'} ${dist} میٹر آگے ہے۔`,
  },
};

/**
 * Generates natural instruction string for a routing step in the target language
 */
export function formatManeuverInstruction({
  maneuverType = 'straight',
  modifier = '',
  distanceM = 50,
  streetName = '',
  destinationName = '',
  lang = 'en',
}) {
  const cleanLang = (lang || 'en').toLowerCase().slice(0, 2);
  const dict = MANEUVER_TRANSLATIONS[cleanLang] || MANEUVER_TRANSLATIONS.en;
  const dist = Math.max(5, Math.round(distanceM));

  // Determine maneuver key
  let actionKey = 'straight';
  if (maneuverType === 'depart') {
    actionKey = 'depart';
  } else if (maneuverType === 'arrive') {
    actionKey = 'arrive';
  } else if (modifier.includes('left')) {
    actionKey = 'turn_left';
  } else if (modifier.includes('right')) {
    actionKey = 'turn_right';
  } else if (modifier.includes('u-turn') || modifier.includes('uturn')) {
    actionKey = 'uturn';
  } else if (maneuverType === 'cross') {
    actionKey = 'cross';
  }

  const fn = dict[actionKey] || dict.straight;
  return fn(dist, streetName || destinationName);
}

