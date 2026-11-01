/**
 * Navigation Voice AI Engine for Smriti Saathi
 * Supports multilingual intent recognition across 13 Indian languages:
 * English, Hindi, Tamil, Assamese, Bengali, Telugu, Malayalam, Kannada, Marathi, Gujarati, Odia, Punjabi, Urdu.
 */

export const ACTION_INTENTS = {
  LOST_REQUEST: 'LOST_REQUEST',
  REPEAT_INSTRUCTION: 'REPEAT_INSTRUCTION',
  NEXT_INSTRUCTION: 'NEXT_INSTRUCTION',
  PREV_INSTRUCTION: 'PREV_INSTRUCTION',
  STOP_NAVIGATION: 'STOP_NAVIGATION',
  CHANGE_DESTINATION: 'CHANGE_DESTINATION',
  CALL_FAMILY: 'CALL_FAMILY',
  CONFIRM_YES: 'CONFIRM_YES',
  CONFIRM_NO: 'CONFIRM_NO',
};

// Multilingual vocabulary patterns across 13 languages
const INTENT_PATTERNS = {
  [ACTION_INTENTS.LOST_REQUEST]: [
    // English
    'i am lost', 'im lost', 'help me', 'take me home', 'guide me home', 'i dont know where i am', 'find home', 'lost',
    // Hindi
    'रास्ता भटक गया', 'भटक गया', 'खो गया', 'मदद करो', 'घर ले चलो', 'घर जाना है', 'रास्ता बताओ', 'कहाँ हूँ',
    // Tamil
    'வழி தவறிவிட்டேன்', 'தொலைந்துவிட்டேன்', 'உதவி செய்', 'வீட்டிற்கு அழைத்துச் செல்', 'வீடு போக வேண்டும்', 'வழி காட்டு',
    // Assamese
    'হেৰাই গৈছোঁ', 'বাট হেৰুৱালোঁ', 'সহায় কৰক', 'ঘৰলৈ লৈ যাওক', 'বাট দেখুৱাওক',
    // Bengali
    'হারিয়ে গেছি', 'পথ হারিয়েছি', 'সাহায্য করুন', 'বাড়ি নিয়ে চলো', 'পথ দেখাও',
    // Telugu
    'దారి తప్పాను', 'దారి తప్పిపోయాను', 'సహాయం చేయండి', 'ఇంటికి తీసుకెళ్లు', 'దారి చూపించు',
    // Malayalam
    'വഴിതെറ്റിപ്പോയി', 'വഴി തെറ്റി', 'സഹായിക്കൂ', 'വീട്ടിൽ എത്തിക്കൂ', 'വഴി കാണിക്കൂ',
    // Kannada
    'ದಾರಿ ತಪ್ಪಿದ್ದೇನೆ', 'ದಾರಿ ತಪ್ಪಿದೆ', 'ಸಹಾಯ ಮಾಡಿ', 'ಮನೆಗೆ ಕರೆದೊಯ್ಯಿರಿ', 'ದಾರಿ ತೋರಿಸಿ',
    // Marathi
    'रस्ता चुकलो', 'वाट चुकलो', 'मदत करा', 'घरी घेऊन चला', 'रस्ता दाखवा',
    // Gujarati
    'રસ્તો ભૂલી ગયો', 'ભૂલો પડ્યો', 'મદદ કરો', 'ઘરે લઈ જાઓ', 'રસ્તો બતાવો',
    // Odia
    'ବାଟ ଭୁଲିଯାଇଛି', 'ହଜିଯାଇଛି', 'ସାହାଯ୍ୟ କରନ୍ତୁ', 'ଘରକୁ ନେଇଚାଲ', 'ବାଟ ଦେଖାଅ',
    // Punjabi
    'ਰਸਤਾ ਭੁੱਲ ਗਿਆ', 'ਗੁਆਚ ਗਿਆ', 'ਮਦਦ ਕਰੋ', 'ਘਰ ਲੈ ਚੱਲੋ', 'ਰਸਤਾ ਦੱਸੋ',
    // Urdu
    'راستہ بھول گیا', 'گم ہو گیا', 'مدد کرو', 'گھر لے چلو', 'راستہ بتاؤ',
  ],

  [ACTION_INTENTS.REPEAT_INSTRUCTION]: [
    'repeat', 'listen again', 'say again', 'hear again', 'what', 'again',
    'फिर से बोलो', 'दोबारा बोलो', 'पुनः सुनो', 'फिर से सुनो', 'क्या कहा',
    'மீண்டும் சொல்', 'மீண்டும் கேள்', 'மறுபடியும் சொல்',
    'পুনৰ কওক', 'আকৌ কওক', 'পুনৰ শুনক',
    'আবার বলো', 'আবার বলুন', 'পুনরায় বলুন',
    'మళ్లీ చెప్పు', 'మళ్లీ విను', 'మరోసారి చెప్పు',
    'വീണ്ടും പറയൂ', 'വീണ്ടും കേൾക്കൂ',
    'ಮತ್ತೆ ಹೇಳಿ', 'ಮತ್ತೊಮ್ಮೆ ಕೇಳಿ',
    'पुन्हा सांगा', 'पुन्हा ऐका',
    'ફરીથી બોલો', 'ફરીથી સાંભળો',
    'ପୁଣି କୁହନ୍ତୁ', 'ପୁଣି ଶୁଣନ୍ତୁ',
    'ਦੁਬਾਰਾ ਬੋਲੋ', 'ਦੁਬਾਰਾ ਸੁਣੋ',
    'دوبارہ بولو', 'پھر سے کہو', 'دوبارہ سنیں',
  ],

  [ACTION_INTENTS.NEXT_INSTRUCTION]: [
    'next', 'next step', 'continue', 'forward', 'proceed', 'go ahead',
    'आगे', 'अगला', 'अगला कदम', 'आगे चलो', 'आगे बढ़ो',
    'அடுத்து', 'அடுத்த படி', 'முன்னே செல்',
    'আগলৈ', 'পৰৱৰ্তী', 'আগবাঢ়ক',
    'পরবর্তী', 'পরের ধাপ', 'এগিয়ে চলো',
    'తరువాత', 'తదుపరి అడుగు', 'ముందుకు సాగు',
    'അടുത്തത്', 'അടുത്ത ഘട്ടം', 'മുന്നോട്ട്',
    'ಮುಂದೆ', 'ಮುಂದಿನ ಹೆಜ್ಜೆ', 'ಮುಂದುವರಿಯಿರಿ',
    'पुढे', 'पुढचे पाऊल', 'पुढे चला',
    'આગળ', 'આગળનું પગલું', 'આગળ વધો',
    'ପରବର୍ତ୍ତୀ', 'ପରବର୍ତ୍ତୀ ପାଦ', 'ଆଗକୁ ଚାଲନ୍ତୁ',
    'ਅੱਗੇ', 'ਅਗਲਾ ਕਦਮ', 'ਅੱਗੇ ਵਧੋ',
    'آگے', 'اگلا قدم', 'آگے بڑھیں',
  ],

  [ACTION_INTENTS.PREV_INSTRUCTION]: [
    'previous', 'back', 'go back', 'prev',
    'पीछे', 'पिछला', 'पिछला कदम', 'पीछे चलो',
    'பின்னால்', 'முந்தைய படி', 'பின்செல்',
    'পিছলৈ', 'পূৰ্বৱৰ্তী',
    'পেছনে', 'আগের ধাপ',
    'వెనుకకు', 'మునుపటి అడుగు',
    'പിന്നോട്ട്', 'മുമ്പത്തെ ഘട്ടം',
    'ಹಿಂದೆ', 'ಹಿಂದಿನ ಹೆಜ್ಜೆ',
    'मागे', 'मागचे पाऊल',
    'પાછળ', 'પાછળનું પગલું',
    'ପଛକୁ', 'ପୂର୍ବ ପାଦ',
    'ਪਿੱਛੇ', 'ਪਿਛਲਾ ਕਦਮ',
    'پیچھے', 'پچھلا قدم',
  ],

  [ACTION_INTENTS.STOP_NAVIGATION]: [
    'stop', 'stop navigation', 'cancel', 'end', 'exit', 'quit',
    'रोको', 'बंद करो', 'नेविगेशन रोको', 'रद्द करो', 'समाप्त',
    'நிறுத்து', 'வழிகாட்டலை நிறுத்து', 'ரத்து செய்',
    'বন্ধ কৰক', 'বাতিল কৰক',
    'বন্ধ করো', 'বাতিল করো',
    'ఆపివేయి', 'రద్దు చేయి',
    'നിർത്തുക', 'റദ്ദാക്കുക',
    'ನಿಲ್ಲಿಸಿ', 'ರದ್ದುಮಾಡಿ',
    'थांबवा', 'रद्द करा',
    'બંધ કરો', 'રદ કરો',
    'ବନ୍ଦ କରନ୍ତୁ', 'ବାତିଲ କରନ୍ତୁ',
    'ਰੋਕੋ', 'ਰੱਦ ਕਰੋ',
    'روکو', 'منسوخ کرو', 'بند کرو',
  ],

  [ACTION_INTENTS.CHANGE_DESTINATION]: [
    'change destination', 'different place', 'another place', 'choose place',
    'मंज़िल बदलो', 'दूसरी जगह', 'दूसरा स्थान',
    'இடத்தை மாற்று', 'வேறு இடம்',
    'স্থান সলনি কৰক', 'আন ঠাই',
    'গন্তব্য পরিবর্তন', 'অন্য স্থান',
    'గమ్యం మార్చు', 'మరో ప్రదేశం',
    'സ്ഥലം മാറ്റുക', 'മറ്റൊരു സ്ഥലം',
    'ಸ್ಥಳ ಬದಲಾಯಿಸಿ', 'ಬೇರೆ ಸ್ಥಳ',
    'ठिकाण बदला', 'दुसरी जागा',
    'સ્થળ બદલો', 'બીજી જગ્યા',
    'ସ୍ଥାନ ବଦଳାନ୍ତୁ', 'ଅନ୍ୟ ସ୍ଥାନ',
    'ਸਥਾਨ ਬਦਲੋ', 'ਦੂਜੀ ਥਾਂ',
    'منزل تبدیل کرو', 'دوسری جگہ',
  ],

  [ACTION_INTENTS.CALL_FAMILY]: [
    'call family', 'call my family', 'call son', 'call daughter', 'call emergency', 'phone',
    'परिवार को फोन करो', 'बेटे को फोन करो', 'बेटी को फोन करो', 'कॉल करो',
    'குடும்பத்தை அழை', 'மகனை அழை', 'மகளுக்கு அழை',
    'পৰিয়াললৈ ফোন কৰক', "ল'ৰাক ফোন কৰক",
    'পরিবারকে ফোন করো', 'ছেলেকে ফোন করো', 'মেয়ে কে ফোন করো',
    'కుటుంబానికి కాల్ చేయి', 'కొడుక్కి కాల్ చేయి',
    'കുടുംബത്തെ വിളിക്കൂ', 'മകനെ വിളിക്കൂ',
    'ಕುಟುಂಬಕ್ಕೆ ಕರೆ ಮಾಡಿ', 'ಮಗನಿಗೆ ಕರೆ ಮಾಡಿ',
    'कुटुंबाला फोन करा', 'मुलाला फोन करा',
    'પરિવારને ફોન કરો', 'દીકરાને ફોન કરો',
    'ପରିବାରକୁ ଫୋନ୍ କରନ୍ତୁ',
    'ਪਰਿਵਾਰ ਨੂੰ ਫ਼ੋਨ ਕਰੋ',
    'خاندان کو فون کرو', 'بیٹے کو فون کرو',
  ],

  [ACTION_INTENTS.CONFIRM_YES]: [
    'yes', 'yeah', 'sure', 'ok', 'guide me', 'please', 'correct',
    'हाँ', 'हाँ जी', 'बिल्कुल', 'रास्ता दिखाओ', 'चलो',
    'ஆம்', 'சரி', 'வழிகாட்டு',
    'হয়', 'ঠিক আছে', 'বাট দেখুৱাওক',
    'হ্যাঁ', 'ঠিক আছে', 'পথ দেখাও',
    'అవును', 'సరే', 'దారి చూపించు',
    'അതെ', 'ശരി', 'വഴി കാണിക്കൂ',
    'ಹೌದು', 'ಸರಿ', 'ದಾರಿ ತೋರಿಸಿ',
    'होय', 'ठीक आहे', 'रस्ता दाखवा',
    'હા', 'બરાબર', 'રસ્તો બતાવો',
    'ହଁ', 'ଠିକ୍ ଅଛି', 'ବାଟ ଦେଖାଅ',
    'ਹਾਂ', 'ਠੀਕ ਹੈ', 'ਰਸਤਾ ਦੱਸੋ',
    'ہاں', 'ٹھیک ہے', 'راستہ دکھاؤ',
  ],

  [ACTION_INTENTS.CONFIRM_NO]: [
    'no', 'nope', 'i am fine', 'no need', 'not now',
    'नहीं', 'मैं ठीक हूँ', 'कोई ज़रूरत नहीं',
    'இல்லை', 'நலமாக உள்ளேன்', 'தேவையில்லை',
    'নহয়', 'মই ভালে আছোঁ', 'প্ৰয়োজন নাই',
    'না', 'আমি ভালো আছি', 'দরকার নেই',
    'కాదు', 'నేను బాగానే ఉన్నాను', 'వద్దు',
    'അല്ല', 'എനിക്ക് കുഴപ്പമില്ല', 'വേണ്ട',
    'ಇಲ್ಲ', 'ನಾನು ಆರಾಮಾಗಿದ್ದೇನೆ', 'ಬೇಡ',
    'नाही', 'मी ठीक आहे', 'नको',
    'ના', 'હું બરાબર છું', 'જરૂર નથી',
    'ନାହିଁ', 'ମୁଁ ଠିକ୍ ଅଛି', 'ଦରକାର ନାହିଁ',
    'ਨਹੀਂ', 'ਮੈਂ ਠੀਕ ਹਾਂ', 'ਲੋੜ ਨਹੀਂ',
    'نہیں', 'میں ٹھیک ہوں', 'ضرورت نہیں',
  ],
};

/**
 * Classifies spoken user text into an action intent in any of the 13 supported languages
 * @param {string} text Spoken input transcript
 * @returns {string|null} Identified ACTION_INTENTS value or null
 */
export function classifyVoiceIntent(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim().toLowerCase();

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (clean.includes(pattern.toLowerCase())) {
        return intent;
      }
    }
  }

  return null;
}

/**
 * Maps language code to BCP 47 Speech Recognition locale
 */
export function getSpeechRecognitionLocale(lang = 'en') {
  const map = {
    en: 'en-IN',
    hi: 'hi-IN',
    ta: 'ta-IN',
    as: 'as-IN',
    bn: 'bn-IN',
    te: 'te-IN',
    ml: 'ml-IN',
    kn: 'kn-IN',
    mr: 'mr-IN',
    gu: 'gu-IN',
    or: 'or-IN',
    pa: 'pa-IN',
    ur: 'ur-IN',
  };
  return map[lang] || 'en-IN';
}

/**
 * Starts continuous or single-shot Speech Recognition with language adaptation
 */
export function listenForNavigationCommand({
  lang = 'en',
  onIntentDetected,
  onTranscript,
  onError,
  onEnd,
}) {
  if (typeof window === 'undefined') return null;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    onError?.('Speech recognition not supported in this browser.');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = getSpeechRecognitionLocale(lang);
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;

  recognition.onresult = (event) => {
    const transcript = event.results[0]?.[0]?.transcript || '';
    onTranscript?.(transcript);

    const intent = classifyVoiceIntent(transcript);
    if (intent) {
      onIntentDetected?.(intent, transcript);
    }
  };

  recognition.onerror = (event) => {
    console.warn('[NavigationVoiceAI] Error:', event.error);
    onError?.(event.error);
  };

  recognition.onend = () => {
    onEnd?.();
  };

  try {
    recognition.start();
    return recognition;
  } catch (err) {
    onError?.(err.message);
    return null;
  }
}
