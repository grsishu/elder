import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.resolve(__dirname, '../client/src/locales');
const enPath = path.join(localesDir, 'en.json');
const hiPath = path.join(localesDir, 'hi.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const hi = JSON.parse(fs.readFileSync(hiPath, 'utf8'));

// Language metadata & common titles/translations
const LANGS = {
  ta: {
    app: { title: 'ஸ்மிருதி சாத்தி', subtitle: 'முதியோர்களுக்கான AI வழிகாட்டி', tagline: 'முதியோரின் பாதுகாப்பு மற்றும் நினைவாற்றல் பயிற்சி' },
    disclaimer: { legal: 'இந்த செயலி நினைவாற்றல் பயிற்சி மற்றும் பாதுகாப்பிற்கு உதவுகிறது. இது மருத்துவ சிகிச்சை அல்ல. மருத்துவ ஆலோசனைகளுக்கு மருத்துவரை அணுகவும்.' },
    common: {
      next: 'அடுத்து', back: 'பின்செல்', save: 'சேமி', cancel: 'ரத்து', confirm: 'உறுதி செய்', done: 'முடிந்தது',
      hear_again: 'மீண்டும் கேள்', listen: 'கேட்கவும்', loading: 'ஏற்றுகிறது...', error: 'பிழை ஏற்பட்டது',
      retry: 'மீண்டும் முயற்சி', call: 'அழை', call_112: 'அவசர 112 அழைக்க', close: 'மூடு', edit: 'திருத்து',
      delete: 'நீக்கு', home: 'முகப்பு', do_later: 'பின்னர் செய்', quick_setup: 'விரைவு அமைப்பு',
      step_of: 'படி {{current}} / {{total}}', seconds: 'நொடிகள்', minutes: 'நிமிடங்கள்'
    },
    auth: { choose_language: 'உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்', enter_mobile: 'மொபைல் எண்ணை உள்ளிடவும்', logout: 'வெளியேறு' },
    home: { title: 'முகப்பு', subtitle: 'ஸ்மிருதி சாத்தி உங்களை வரவேற்கிறது' }
  },
  as: {
    app: { title: 'স্মৃতি সাথী', subtitle: 'বয়োজ্যেষ্ঠসকলৰ এআই সংগী', tagline: 'উত্তৰ-পূৰ্বাঞ্চলৰ বয়োজ্যেষ্ঠসকলৰ বাবে স্মৃতি সহায়' },
    disclaimer: { legal: 'এই এপে স্মৃতিৰ অভ্যাস আৰু সুৰক্ষাত সহায় কৰে। চিকিৎসাজনিত চিন্তাৰ বাবে চিকিৎসকৰ পৰামৰ্শ লওক।' },
    common: {
      next: 'আগলৈ', back: 'পিছলৈ', save: 'সংৰক্ষণ কৰক', cancel: 'বাতিল কৰক', confirm: 'নিশ্চিত কৰক', done: 'সম্পূৰ্ণ',
      hear_again: 'পুনৰ শুনক', listen: 'শুনক', loading: 'অপেক্ষা কৰক...', error: 'আসোঁৱাহ ঘটিছে',
      retry: 'পুনৰ চেষ্টা কৰক', call: 'কল কৰক', call_112: 'জৰুৰীকালীন ১১২ লৈ কল কৰক', close: 'বন্ধ কৰক',
      edit: 'সম্পাদনা', delete: 'মচি পেলাওক', home: 'গৃহপৃষ্ঠা', do_later: 'পাছত কৰিম', quick_setup: 'দ্ৰুত প্ৰস্তুতি',
      step_of: 'ধাপ {{current}} / {{total}}', seconds: 'ছেকেণ্ড', minutes: 'মিনিট'
    },
    auth: { choose_language: 'আপোনাৰ ভাষা বাছক', enter_mobile: 'মোবাইল নম্বৰ দিয়ক', logout: 'লগ আউট' },
    home: { title: 'মুখ্য পৃষ্ঠা', subtitle: 'স্মৃতি সাথীলৈ স্বাগতম' }
  },
  bn: {
    app: { title: 'স্মৃতি সাথী', subtitle: 'বয়োজ্যেষ্ঠদের এআই সঙ্গী ও অভিভাবক', tagline: 'স্মৃতি সহায়তা ও বৌদ্ধিক চর্চা' },
    disclaimer: { legal: 'এই অ্যাপটি স্মৃতির অভ্যাস এবং সুরক্ষায় সহায়তা করে। যেকোনো চিকিৎসার জন্য চিকিৎসকের পরামর্শ নিন।' },
    common: {
      next: 'পরবর্তী', back: 'পেছনে', save: 'সংরক্ষণ', cancel: 'বাতিল', confirm: 'নিশ্চিত করুন', done: 'সম্পন্ন',
      hear_again: 'আবার শুনুন', listen: 'শুনুন', loading: 'লোড হচ্ছে...', error: 'ত্রুটি ঘটেছে',
      retry: 'আবার চেষ্টা করুন', call: 'কল করুন', call_112: 'জরুরী ১১২ কল করুন', close: 'বন্ধ করুন',
      edit: 'সম্পাদনা', delete: 'মুছুন', home: 'হোম', do_later: 'পরে করব', quick_setup: 'দ্রুত সেটআপ',
      step_of: 'ধাপ {{current}} / {{total}}', seconds: 'সেকেন্ড', minutes: 'মিনিট'
    },
    auth: { choose_language: 'আপনার ভাষা বেছে নিন', enter_mobile: 'মোবাইল নম্বর লিখুন', logout: 'লগ আউট' },
    home: { title: 'হোম ড্যাশবোর্ড', subtitle: 'স্মৃতি সাথীতে স্বাগতম' }
  },
  te: {
    app: { title: 'స్మృతి సాథీ', subtitle: 'వృద్ధుల AI రక్షకుడు మరియు సహచరుడు', tagline: 'జ్ఞాపకశక్తి సాధన మరియు భద్రతా సహాయం' },
    disclaimer: { legal: 'ఈ యాప్ జ్ఞాపకశక్తి సాధన మరియు భద్రతకు మద్దతు ఇస్తుంది. వైద్య సలహా కోసం వైద్యుడిని సంప్రదించండి.' },
    common: {
      next: 'తరువాత', back: 'వెనుకకు', save: 'సేవ్', cancel: 'రద్దు', confirm: 'నిర్ధారించండి', done: 'పూర్తయింది',
      hear_again: 'మళ్లీ వినండి', listen: 'వినండి', loading: 'లోడ్ అవుతోంది...', error: 'లోపం జరిగింది',
      retry: 'మళ్లీ ప్రయత్నించండి', call: 'కాల్ చేయండి', call_112: 'ఎమర్జెన్సీ 112 కి కాల్ చేయండి', close: 'మూసివేయి',
      edit: 'సవరించు', delete: 'తొలగించు', home: 'హోమ్', do_later: 'తర్వాత చేస్తాను', quick_setup: 'త్వరిత సెటప్',
      step_of: 'దశ {{current}} / {{total}}', seconds: 'సెకన్లు', minutes: 'నిమిషాలు'
    },
    auth: { choose_language: 'మీ భాషను ఎంచుకోండి', enter_mobile: 'మొబైల్ నంబర్ నమోదు చేయండి', logout: 'లాగ్ అవుట్' },
    home: { title: 'హోమ్ డాష్‌బోర్డ్', subtitle: 'స్మృతి సాథీకి స్వాగతం' }
  },
  ml: {
    app: { title: 'സ്മൃതി സാഥി', subtitle: 'മുതിർന്നവർക്കുള്ള AI രക്ഷാധികാരി', tagline: 'ഓർമ്മ പരിശീലനവും സുരക്ഷാ സഹായവും' },
    disclaimer: { legal: 'ഈ ആപ്പ് ഓർമ്മ പരിശീലനത്തെയും സുരക്ഷയെയും സഹായിക്കുന്നു. വൈദ്യോപദേശത്തിന് ഡോക്ടറെ സമീപിക്കുക.' },
    common: {
      next: 'അടുത്തത്', back: 'തിരികെ', save: 'സംരക്ഷിക്കുക', cancel: 'റദ്ദാക്കുക', confirm: 'സ്ഥിരീകരിക്കുക', done: 'പൂർത്തിയായി',
      hear_again: 'വീണ്ടും കേൾക്കുക', listen: 'കേൾക്കുക', loading: 'ലോഡുചെയ്യുന്നു...', error: 'പിശക് സംഭവിച്ചു',
      retry: 'വീണ്ടും ശ്രമിക്കുക', call: 'വിളിക്കുക', call_112: 'എമർജൻസി 112 വിളിക്കുക', close: 'അടയ്ക്കുക',
      edit: 'തിരുത്തുക', delete: 'ഇല്ലാതാക്കുക', home: 'ഹോം', do_later: 'പിന്നീട് ചെയ്യാം', quick_setup: 'വേഗത്തിലുള്ള സജ്ജീകരണം',
      step_of: 'ഘട്ടം {{current}} / {{total}}', seconds: 'സെക്കൻഡ്', minutes: 'മിനിറ്റ്'
    },
    auth: { choose_language: 'നിങ്ങളുടെ ഭാഷ തിരഞ്ഞെടുക്കുക', enter_mobile: 'മൊബൈൽ നമ്പർ നൽകുക', logout: 'ലോഗ് ഔട്ട്' },
    home: { title: 'ഹോം ഡാഷ്‌ബോർഡ്', subtitle: 'സ്മൃതി സാഥിയിലേക്ക് സ്വാഗതം' }
  },
  kn: {
    app: { title: 'ಸ್ಮೃತಿ ಸಾಥಿ', subtitle: 'ಹಿರಿಯರ AI ರಕ್ಷಕ ಮತ್ತು ಒಡನಾಡಿ', tagline: 'ನೆನಪಿನ ಶಕ್ತಿ ಅಭ್ಯಾಸ ಮತ್ತು ಸುರಕ್ಷತೆ' },
    disclaimer: { legal: 'ಈ ಅಪ್ಲಿಕೇಶನ್ ನೆನಪಿನ ಶಕ್ತಿ ಮತ್ತು ಸುರಕ್ಷತೆಗೆ ಸಹಾಯ ಮಾಡುತ್ತದೆ. ವೈದ್ಯಕೀಯ ಸಲಹೆಗೆ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ.' },
    common: {
      next: 'ಮುಂದೆ', back: 'ಹಿಂದೆ', save: 'ಉಳಿಸಿ', cancel: 'ರದ್ದುಮಾಡಿ', confirm: 'ದೃಢೀಕರಿಸಿ', done: 'ಮುಗಿದಿದೆ',
      hear_again: 'ಮತ್ತೊಮ್ಮೆ ಕೇಳಿ', listen: 'ಕೇಳಿ', loading: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ...', error: 'ದೋಷ ಸಂಭವಿಸಿದೆ',
      retry: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ', call: 'ಕರೆ ಮಾಡಿ', call_112: 'ತುರ್ತು 112 ಗೆ ಕರೆ ಮಾಡಿ', close: 'ಮುಚ್ಚಿ',
      edit: 'ತಿದ್ದಿ', delete: 'ಅಳಿಸಿ', home: 'ಮುಖಪುಟ', do_later: 'ನಂತರ ಮಾಡುವೆ', quick_setup: 'ತ್ವರಿತ ಸೆಟಪ್',
      step_of: 'ಹಂತ {{current}} / {{total}}', seconds: 'ಸೆಕೆಂಡುಗಳು', minutes: 'ನಿಮಿಷಗಳು'
    },
    auth: { choose_language: 'ನಿಮ್ಮ ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ', enter_mobile: 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ', logout: 'ಲಾಗ್ ಔಟ್' },
    home: { title: 'ಮುಖಪುಟ', subtitle: 'ಸ್ಮೃತಿ ಸಾಥಿಗೆ ಸುಸ್ವಾಗತ' }
  },
  mr: {
    app: { title: 'स्मृती साथी', subtitle: 'ज्येष्ठ नागरिकांसाठी AI रक्षक व मार्गदर्शक', tagline: 'स्मरणशक्ती सराव व सुरक्षितता' },
    disclaimer: { legal: 'हे ॲप स्मरणशक्ती सराव आणि सुरक्षेसाठी आहे. वैद्यकीय सल्ल्यासाठी कृपया डॉक्टरांशी संपर्क साधा.' },
    common: {
      next: 'पुढे', back: 'मागे', save: 'जतन करा', cancel: 'रद्द करा', confirm: 'पुष्टी करा', done: 'पूर्ण झाले',
      hear_again: 'पुन्हा ऐका', listen: 'ऐका', loading: 'लोड होत आहे...', error: 'त्रुटी आढळली',
      retry: 'पुन्हा प्रयत्न करा', call: 'कॉल करा', call_112: 'आपत्कालीन ११२ वर कॉल करा', close: 'बंद करा',
      edit: 'संपादित करा', delete: 'हटवा', home: 'मुख्यपृष्ठ', do_later: 'नंतर करू', quick_setup: 'जलद सेटअप',
      step_of: 'टप्पा {{current}} / {{total}}', seconds: 'सेकंद', minutes: 'मिनिटे'
    },
    auth: { choose_language: 'तुमची भाषा निवडा', enter_mobile: 'मोबाईल नंबर टाका', logout: 'लॉग आऊट' },
    home: { title: 'मुख्य डॅशबोर्ड', subtitle: 'स्मृती साथी मध्ये आपले स्वागत आहे' }
  },
  gu: {
    app: { title: 'સ્મૃતિ સાથી', subtitle: 'વડીલો માટે AI રક્ષક અને સાથી', tagline: 'યાદશક્તિ અભ્યાસ અને સુરક્ષા સહાય' },
    disclaimer: { legal: 'આ એપ યાદશક્તિના અભ્યાસ અને સુરક્ષા માટે છે. તબીબી સલાહ માટે ડૉક્ટરનો સંપર્ક કરો.' },
    common: {
      next: 'આગળ', back: 'પાછળ', save: 'સાચવો', cancel: 'રદ કરો', confirm: 'ખાતરી કરો', done: 'પૂર્ણ થયું',
      hear_again: 'ફરીથી સાંભળો', listen: 'સાંભળો', loading: 'લોડ થઈ રહ્યું છે...', error: 'ભૂલ આવી',
      retry: 'ફરી પ્રયાસ કરો', call: 'કોલ કરો', call_112: 'ઇમરજન્સી 112 પર કૉલ કરો', close: 'બંધ કરો',
      edit: 'ફેરફાર કરો', delete: 'કાઢી નાખો', home: 'હોમ', do_later: 'પછી કરીશું', quick_setup: 'ઝડપી સેટઅપ',
      step_of: 'પગલું {{current}} / {{total}}', seconds: 'સેકન્ડ', minutes: 'મિનિટ'
    },
    auth: { choose_language: 'તમારી ભાષા પસંદ કરો', enter_mobile: 'મોબાઇલ નંબર દાખલ કરો', logout: 'લૉગ આઉટ' },
    home: { title: 'હોમ ડેશબોર્ડ', subtitle: 'સ્મૃતિ સાથીમાં આપનું સ્વાગત છે' }
  },
  or: {
    app: { title: 'ସ୍ମୃତି ସାଥୀ', subtitle: 'ବରିଷ୍ଠ ନାଗରିକଙ୍କ AI ସାଥୀ ଓ ସୁରକ୍ଷାକର୍ତ୍ତା', tagline: 'ସ୍ମୃତି ଅଭ୍ୟାସ ଓ ସୁରକ୍ଷା ସହାୟତା' },
    disclaimer: { legal: 'ଏହି ଆପ୍ ସ୍ମୃତି ଅଭ୍ୟାସ ଏବଂ ସୁରକ୍ଷାରେ ସାହାଯ୍ୟ କରେ। ଚିକିତ୍ସା ପାଇଁ ଡାକ୍ତରଙ୍କ ସହିତ ପରାମର୍ଶ କରନ୍ତୁ।' },
    common: {
      next: 'ପରବର୍ତ୍ତୀ', back: 'ପଛକୁ', save: 'ସାଇତନ୍ତୁ', cancel: 'ବାତିଲ କରନ୍ତୁ', confirm: 'ନିଶ୍ଚିତ କରନ୍ତୁ', done: 'ସମ୍ପୂର୍ଣ୍ଣ',
      hear_again: 'ପୁଣି ଶୁଣନ୍ତୁ', listen: 'ଶୁଣନ୍ତୁ', loading: 'ଲୋଡ୍ ହେଉଛି...', error: 'ତ୍ରୁଟି ଘଟିଲା',
      retry: 'ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ', call: 'କଲ୍ କରନ୍ତୁ', call_112: 'ଜରୁରୀକାଳୀନ ୧୧୨ କଲ୍ କରନ୍ତୁ', close: 'ବନ୍ଦ କରନ୍ତୁ',
      edit: 'ସମ୍ପାଦନ କରନ୍ତୁ', delete: 'ଲିଭାନ୍ତୁ', home: 'ମୂଳପୃଷ୍ଠା', do_later: 'ପରେ କରିବି', quick_setup: 'ଶୀଘ୍ର ସେଟଅପ୍',
      step_of: 'ପାଦ {{current}} / {{total}}', seconds: 'ସେକେଣ୍ଡ', minutes: 'ମିନିଟ୍'
    },
    auth: { choose_language: 'ଆପଣଙ୍କ ଭାଷା ବାଛନ୍ତୁ', enter_mobile: 'ମୋବାଇଲ୍ ନମ୍ବର ଲେଖନ୍ତୁ', logout: 'ଲଗ୍ ଆଉଟ୍' },
    home: { title: 'ମୂଳ ଡ୍ୟାସବୋର୍ଡ', subtitle: 'ସ୍ମୃତି ସାଥୀକୁ ସ୍ୱାଗତ' }
  },
  pa: {
    app: { title: 'ਸਮ੍ਰਿਤੀ ਸਾਥੀ', subtitle: 'ਬਜ਼ੁਰਗਾਂ ਦਾ AI ਰੱਖਿਅਕ ਅਤੇ ਸਾਥੀ', tagline: 'ਯਾਦਦਾਸ਼ਤ ਅਭਿਆਸ ਅਤੇ ਸੁਰੱਖਿਆ' },
    disclaimer: { legal: 'ਇਹ ਐਪ ਯਾਦਦਾਸ਼ਤ ਅਭਿਆਸ ਅਤੇ ਸੁਰੱਖਿਆ ਲਈ ਹੈ। ਡਾਕਟਰੀ ਸਲਾਹ ਲਈ ਕਿਰਪਾ ਕਰਕੇ ਡਾਕਟਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।' },
    common: {
      next: 'ਅੱਗੇ', back: 'ਪਿੱਛੇ', save: 'ਸੰਭਾਲੋ', cancel: 'ਰੱਦ ਕਰੋ', confirm: 'ਪੁਸ਼ਟੀ ਕਰੋ', done: 'ਸਮਾਪਤ',
      hear_again: 'ਦੁਬਾਰਾ ਸੁਣੋ', listen: 'ਸੁਣੋ', loading: 'ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ...', error: 'ਗਲਤੀ ਆਈ',
      retry: 'ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ', call: 'ਕਾਲ ਕਰੋ', call_112: 'ਐਮਰਜੈਂਸੀ 112 ਕਾਲ ਕਰੋ', close: 'ਬੰਦ ਕਰੋ',
      edit: 'ਸੋਧੋ', delete: 'ਮਿਟਾਓ', home: 'ਮੁੱਖ ਪੰਨਾ', do_later: 'ਬਾਅਦ ਵਿੱਚ ਕਰਾਂਗੇ', quick_setup: 'ਤੁਰੰਤ ਸੈੱਟਅੱਪ',
      step_of: 'ਕਦਮ {{current}} / {{total}}', seconds: 'ਸਕਿੰਟ', minutes: 'ਮਿੰਟ'
    },
    auth: { choose_language: 'ਆਪਣੀ ਭਾਸ਼ਾ ਚੁਣੋ', enter_mobile: 'ਮੋਬਾਈਲ ਨੰਬਰ ਭਰੋ', logout: 'ਲਾਗ ਆਊਟ' },
    home: { title: 'ਮੁੱਖ ਡੈਸ਼ਬੋਰਡ', subtitle: 'ਸਮ੍ਰਿਤੀ ਸਾਥੀ ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ' }
  },
  ur: {
    app: { title: 'سمرتی ساتھی', subtitle: 'بزرگوں کا AI نگہبان اور ساتھی', tagline: 'یادداشت کی مشق اور تحفظ کی امداد' },
    disclaimer: { legal: 'یہ ایپ یادداشت کی مشق اور تحفظ میں مدد فراہم کرتی ہے۔ طبی مشورے کے لیے ڈاکٹر سے رجوع کریں۔' },
    common: {
      next: 'آگے', back: 'پیچھے', save: 'محفوظ کریں', cancel: 'منسوخ کریں', confirm: 'تصدیق کریں', done: 'مکمل',
      hear_again: 'دوبارہ سنیں', listen: 'سنیں', loading: 'لوڈ ہو رہا ہے...', error: 'خرابی پیش آگئی',
      retry: 'دوبارہ کوشش کریں', call: 'کال کریں', call_112: 'ایمرجنسی 112 پر کال کریں', close: 'بند کریں',
      edit: 'ترمیم کریں', delete: 'حذف کریں', home: 'ہوم', do_later: 'بعد میں کریں', quick_setup: 'فوری سیٹ اپ',
      step_of: 'مرحلہ {{current}} / {{total}}', seconds: 'سیکنڈ', minutes: 'منٹ'
    },
    auth: { choose_language: 'اپنی زبان منتخب کریں', enter_mobile: 'موبائل نمبر درج کریں', logout: 'لاگ آؤٹ' },
    home: { title: 'ہوم ڈیش بورڈ', subtitle: 'سمرتی ساتھی میں خوش آمدید' }
  }
};

function deepMerge(base, override) {
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(override || {})) {
    if (
      override[key] &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      base[key] &&
      typeof base[key] === 'object'
    ) {
      result[key] = deepMerge(base[key], override[key]);
    } else if (override[key] !== undefined) {
      result[key] = override[key];
    }
  }
  return result;
}

// Write all 13 locales
for (const [code, overrides] of Object.entries(LANGS)) {
  // Merge base (hindi or english) with language specific overrides
  const fullLocale = deepMerge(hi, overrides);
  const outPath = path.join(localesDir, `${code}.json`);
  fs.writeFileSync(outPath, JSON.stringify(fullLocale, null, 2), 'utf8');
  console.log(`[i18n builder] Generated ${outPath} (${Object.keys(fullLocale).length} top-level keys)`);
}

console.log('[i18n builder] Successfully built all 13 locales!');

