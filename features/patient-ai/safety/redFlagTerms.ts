/**
 * Emergency phrases per category and language. Matched on the phone before any
 * AI call, so the "Call 108" banner appears instantly, even offline.
 *
 * NEEDS NATIVE-SPEAKER REVIEW before release. Terms are kept conservative:
 * words that are also common everyday words (e.g. Bengali/Kannada/Marathi
 * "vish-" = poison, but "vishay" = subject) are only listed inside a phrase.
 * Not yet covered: Odia, Assamese, Kashmiri (the server-side check
 * translates to English and runs the English list as a second net).
 */

export type RedFlagCategory =
  | 'cardiac'
  | 'breathing'
  | 'stroke'
  | 'unconscious'
  | 'seizure'
  | 'bleeding'
  | 'self_harm'
  | 'poisoning'
  | 'snakebite'
  | 'burns'
  | 'pregnancy'
  | 'choking'
  | 'heatstroke';

export interface CategoryRule {
  /** Self-harm still shows the helpline when negated ("I'm not suicidal") because the cost of showing it is low. */
  ignoreNegation?: boolean;
  /** Ignore general-knowledge questions like "what is a heart attack?" that have no first-person words. */
  allowInformational?: boolean;
  terms: Record<string, string[]>;
}

export const RED_FLAG_TERMS: Record<RedFlagCategory, CategoryRule> = {
  cardiac: {
    allowInformational: true,
    terms: {
      en: ['chest pain', 'pain in my chest', 'pain in chest', 'chest tightness', 'tight chest', 'crushing chest', 'heart attack'],
      hinglish: ['seene me dard', 'seene mein dard', 'sine me dard', 'chhati me dard', 'chhati mein dard', 'chaati me dard', 'dil ka daura'],
      hi: ['सीने में दर्द', 'छाती में दर्द', 'दिल का दौरा', 'हार्ट अटैक'],
      ur: ['سینے میں درد', 'دل کا دورہ'],
      bn: ['বুকে ব্যথা', 'হার্ট অ্যাটাক'],
      ta: ['நெஞ்சு வலி', 'நெஞ்சுவலி', 'மாரடைப்பு'],
      te: ['ఛాతీ నొప్పి', 'గుండెపోటు', 'గుండె నొప్పి'],
      mr: ['छातीत दुख', 'हृदयविकाराचा झटका'],
      gu: ['છાતીમાં દુખાવો', 'હાર્ટ એટેક'],
      kn: ['ಎದೆ ನೋವು', 'ಹೃದಯಾಘಾತ'],
      ml: ['നെഞ്ചുവേദന', 'നെഞ്ച് വേദന', 'ഹൃദയാഘാതം'],
      pa: ['ਛਾਤੀ ਵਿੱਚ ਦਰਦ', 'ਦਿਲ ਦਾ ਦੌਰਾ'],
    },
  },
  breathing: {
    terms: {
      en: ["can't breathe", 'cant breathe', 'cannot breathe', 'unable to breathe', 'difficulty breathing', 'trouble breathing', 'hard to breathe', 'short of breath', 'shortness of breath', 'not breathing', 'gasping for air', 'lips turning blue', 'lips are blue'],
      hinglish: ['saans nahi aa rahi', 'saans nahi le pa', 'saans lene me takleef', 'saans lene mein takleef', 'saans lene me dikkat', 'saans lene mein dikkat', 'saans phool rahi'],
      hi: ['सांस नहीं आ रही', 'साँस नहीं आ रही', 'सांस नहीं ले पा', 'सांस लेने में तकलीफ', 'साँस लेने में तकलीफ', 'सांस लेने में दिक्कत', 'साँस लेने में दिक्कत', 'सांस फूल रही'],
      ur: ['سانس نہیں آ رہی', 'سانس لینے میں تکلیف', 'سانس لینے میں دشواری'],
      bn: ['শ্বাসকষ্ট', 'শ্বাস নিতে পারছি না', 'শ্বাস নিতে কষ্ট'],
      ta: ['மூச்சு திணறல்', 'மூச்சுத் திணறல்', 'மூச்சு விட முடியவில்லை'],
      te: ['ఊపిరి ఆడటం లేదు', 'శ్వాస తీసుకోవడం కష్టం'],
      mr: ['श्वास घेता येत नाही', 'श्वास घेण्यास त्रास'],
      gu: ['શ્વાસ લેવામાં તકલીફ', 'શ્વાસ નથી લેવાતો'],
      kn: ['ಉಸಿರಾಟದ ತೊಂದರೆ', 'ಉಸಿರು ಕಟ್ಟುತ್ತಿದೆ'],
      ml: ['ശ്വാസം മുട്ടൽ', 'ശ്വാസംമുട്ടൽ'],
      pa: ['ਸਾਹ ਲੈਣ ਵਿੱਚ ਤਕਲੀਫ਼', 'ਸਾਹ ਨਹੀਂ ਆ ਰਿਹਾ'],
    },
  },
  stroke: {
    allowInformational: true,
    terms: {
      en: ['stroke', 'face drooping', 'face is drooping', 'slurred speech', 'speech is slurred', 'weakness on one side', 'numbness on one side', 'one side of my body', 'one side of his body', 'one side of her body', 'paralysis', 'paralysed', 'paralyzed'],
      hinglish: ['lakwa', 'laqwa', 'muh tedha', 'munh tedha'],
      hi: ['लकवा', 'चेहरा टेढ़ा', 'मुंह टेढ़ा', 'मुँह टेढ़ा', 'एक तरफ कमजोरी'],
      ur: ['فالج', 'لقوہ'],
      bn: ['স্ট্রোক', 'পক্ষাঘাত'],
      ta: ['பக்கவாதம்'],
      te: ['పక్షవాతం'],
      mr: ['अर्धांगवायू', 'पक्षाघात'],
      gu: ['લકવો'],
      kn: ['ಪಾರ್ಶ್ವವಾಯು'],
      ml: ['പക്ഷാഘാതം'],
      pa: ['ਅਧਰੰਗ'],
    },
  },
  unconscious: {
    terms: {
      en: ['unconscious', 'passed out', 'fainted', 'not waking up', "won't wake up", 'unresponsive', 'collapsed'],
      hinglish: ['behosh', 'hosh nahi'],
      hi: ['बेहोश', 'होश नहीं'],
      ur: ['بے ہوش', 'بیہوش'],
      bn: ['অজ্ঞান'],
      ta: ['சுயநினைவு இல்லை', 'சுயநினைவு இழந்'],
      te: ['స్పృహ కోల్పోయ', 'స్పృహ లేదు'],
      mr: ['बेशुद्ध'],
      gu: ['બેભાન'],
      kn: ['ಪ್ರಜ್ಞೆ ತಪ್ಪಿ', 'ಪ್ರಜ್ಞಾಹೀನ'],
      ml: ['ബോധം പോയി', 'ബോധമില്ല'],
      pa: ['ਬੇਹੋਸ਼'],
    },
  },
  seizure: {
    allowInformational: true,
    terms: {
      en: ['seizure', 'seizures', 'convulsion', 'convulsions', 'having fits', 'having a fit'],
      hinglish: ['mirgi ka daura', 'daura pad', 'jhatke aa rahe'],
      hi: ['मिर्गी का दौरा', 'दौरा पड़', 'झटके आ रहे'],
      ur: ['مرگی کا دورہ', 'دورہ پڑ'],
      bn: ['খিঁচুনি'],
      ta: ['வலிப்பு'],
      te: ['మూర్ఛ', 'ఫిట్స్'],
      mr: ['फेफरे', 'फिट येत'],
      gu: ['આંચકી'],
      kn: ['ಮೂರ್ಛೆ', 'ಫಿಟ್ಸ್'],
      ml: ['അപസ്മാരം'],
      pa: ['ਦੌਰਾ ਪੈ', 'ਮਿਰਗੀ'],
    },
  },
  bleeding: {
    terms: {
      en: ['heavy bleeding', 'bleeding heavily', 'bleeding a lot', "won't stop bleeding", "bleeding won't stop", 'bleeding will not stop', 'vomiting blood', 'coughing up blood', 'blood in vomit'],
      hinglish: ['khoon nahi ruk raha', 'bahut khoon', 'khoon ki ulti'],
      hi: ['खून नहीं रुक रहा', 'बहुत खून', 'खून की उल्टी', 'ज़्यादा खून', 'ज्यादा खून'],
      ur: ['خون نہیں رک رہا', 'بہت خون', 'خون کی الٹی'],
      bn: ['রক্ত বন্ধ হচ্ছে না', 'রক্তবমি'],
      ta: ['இரத்தம் நிற்கவில்லை', 'ரத்தம் நிற்கவில்லை', 'இரத்த வாந்தி'],
      te: ['రక్తం ఆగడం లేదు', 'రక్తపు వాంతి'],
      mr: ['रक्त थांबत नाही', 'रक्ताची उलटी'],
      gu: ['લોહી બંધ નથી થતું', 'લોહીની ઉલટી'],
      kn: ['ರಕ್ತ ನಿಲ್ಲುತ್ತಿಲ್ಲ', 'ರಕ್ತ ವಾಂತಿ'],
      ml: ['രക്തം നിൽക്കുന്നില്ല', 'രക്തം ഛർദ്ദി'],
      pa: ['ਖੂਨ ਨਹੀਂ ਰੁਕ ਰਿਹਾ'],
    },
  },
  self_harm: {
    ignoreNegation: true,
    terms: {
      en: ['suicide', 'suicidal', 'kill myself', 'end my life', 'want to die', "don't want to live", 'dont want to live', 'self harm', 'self-harm', 'hurt myself'],
      hinglish: ['khudkushi', 'aatmahatya', 'atmahatya', 'mar jana chahta', 'mar jana chahti', 'jeena nahi chahta', 'jeena nahi chahti'],
      hi: ['आत्महत्या', 'खुदकुशी', 'ख़ुदकुशी', 'मर जाना चाहता', 'मर जाना चाहती', 'जीना नहीं चाहता', 'जीना नहीं चाहती', 'खुद को मार'],
      ur: ['خودکشی', 'مر جانا چاہتا', 'مر جانا چاہتی'],
      bn: ['আত্মহত্যা'],
      ta: ['தற்கொலை'],
      te: ['ఆత్మహత్య'],
      mr: ['जीव द्यायचा'],
      gu: ['આત્મહત્યા'],
      kn: ['ಆತ್ಮಹತ್ಯೆ'],
      ml: ['ആത്മഹത്യ'],
      pa: ['ਖੁਦਕੁਸ਼ੀ', 'ਆਤਮਹੱਤਿਆ'],
    },
  },
  poisoning: {
    terms: {
      en: ['poison', 'poisoning', 'pesticide', 'rat poison', 'overdose', 'took too many tablets', 'took too many pills', 'swallowed bleach', 'drank kerosene'],
      hinglish: ['zeher', 'zehar', 'jahar', 'keetnashak'],
      hi: ['ज़हर', 'जहर', 'कीटनाशक', 'ओवरडोज़', 'ओवरडोज'],
      ur: ['زہر'],
      bn: ['বিষ খেয়ে', 'কীটনাশক'],
      ta: ['விஷம்', 'பூச்சிக்கொல்லி'],
      te: ['విషం', 'పురుగుల మందు'],
      mr: ['विषबाधा', 'विष प्याय', 'कीटकनाशक'],
      gu: ['ઝેર'],
      kn: ['ವಿಷ ಕುಡಿದ', 'ವಿಷ ಸೇವನೆ'],
      ml: ['വിഷം'],
      pa: ['ਜ਼ਹਿਰ'],
    },
  },
  snakebite: {
    terms: {
      en: ['snake bite', 'snakebite', 'bitten by a snake', 'snake bit'],
      hinglish: ['saanp ne kaat', 'sanp ne kaat', 'saap ne kaat', 'saanp ne kata', 'sanp ne kata'],
      hi: ['साँप ने काट', 'सांप ने काट', 'सर्पदंश'],
      ur: ['سانپ نے کاٹ'],
      bn: ['সাপে কেটেছে', 'সাপের কামড়'],
      ta: ['பாம்பு கடி'],
      te: ['పాము కాటు', 'పాము కరిచ'],
      mr: ['साप चावला'],
      gu: ['સાપ કરડ'],
      kn: ['ಹಾವು ಕಚ್ಚಿ', 'ಹಾವು ಕಡಿತ'],
      ml: ['പാമ്പ് കടിച്ചു', 'പാമ്പുകടി'],
      pa: ['ਸੱਪ ਨੇ ਡੰਗ'],
    },
  },
  burns: {
    terms: {
      en: ['severe burn', 'badly burned', 'badly burnt', 'caught fire', 'acid attack'],
      hinglish: ['buri tarah jal', 'aag lag gayi'],
      hi: ['बुरी तरह जल', 'आग लग गई', 'तेज़ाब', 'तेजाब'],
      ur: ['بری طرح جل', 'تیزاب'],
    },
  },
  pregnancy: {
    terms: {
      en: ['bleeding during pregnancy', 'pregnant and bleeding', 'water broke', 'waters broke', 'labour pain', 'labor pain', 'baby is not moving', 'baby not moving'],
      hinglish: ['pregnancy me bleeding', 'pregnancy mein bleeding', 'pani ki thaili phat'],
      hi: ['गर्भावस्था में खून', 'प्रसव पीड़ा', 'पानी की थैली फट', 'बच्चा हिल नहीं रहा'],
      ur: ['حمل میں خون', 'درد زہ'],
    },
  },
  choking: {
    terms: {
      en: ['choking', 'something stuck in throat', 'stuck in his throat', 'stuck in her throat', 'stuck in my throat'],
      hinglish: ['gale me kuch phas', 'gale mein kuch phas', 'gale me atak'],
      hi: ['गले में कुछ फंस', 'गले में कुछ फँस', 'गले में अटक'],
      ur: ['گلے میں کچھ پھنس'],
    },
  },
  heatstroke: {
    terms: {
      en: ['heat stroke', 'heatstroke', 'sunstroke', 'sun stroke'],
      hinglish: ['loo lag'],
      hi: ['लू लग'],
      ur: ['لو لگ'],
    },
  },
};

/** Words that negate a symptom when they come right before it (English). */
export const NEGATORS_BEFORE = new Set(['no', 'not', 'never', 'without', "don't", 'dont', "doesn't", 'doesnt', "isn't", 'isnt', "wasn't", 'wasnt', "haven't", 'havent', "hasn't", 'hasnt', 'denies']);

/** Words that negate a symptom when they come right after it, at the end of the sentence or before a copula. */
export const NEGATORS_AFTER = new Set(['नहीं', 'नही', 'nahi', 'nahin', 'nai', 'نہیں', 'না', 'নেই', 'இல்லை', 'లేదు', 'नाही', 'નથી', 'ಇಲ್ಲ', 'ഇല്ല', 'ਨਹੀਂ']);
export const COPULAS = new Set(['है', 'हैं', 'था', 'थी', 'hai', 'hain', 'he', 'tha', 'thi', 'ہے', 'ہیں', 'تھا', 'تھی', 'आहे']);

/** First-person words: their presence means the user is describing a real situation, not asking a general question. */
export const FIRST_PERSON = /\b(i|i'm|im|i've|me|my|mine|we|our|us|he|she|his|her|him|they|their|mujhe|mera|meri|mere|hum|humein|hamara|uska|uski|use)\b/;
/**
 * Definition-style questions only. "What to do if someone has chest pain" is NOT informational:
 * it is someone asking for help, so it must still trigger.
 */
export const INFORMATIONAL_START = /^(what (is|are|causes|happens in)|how (does|is)|why (does|do|is)|tell me about|explain|define|describe)\b/;
