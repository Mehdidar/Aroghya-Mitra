/**
 * Approved health content the chatbot may use for medical facts (RAG).
 *
 * STATUS: seed set. Each entry is a short plain-language SUMMARY of public
 * WHO / MoHFW guidance written for this app, not a verbatim quote. Every entry
 * has `reviewed: false` until a clinician on the team checks it against the
 * linked source. Replace or extend with official text before release.
 *
 * Keywords include Hindi and Hinglish words, so retrieval works even when the
 * query is not translated to English.
 */
import type { RedFlagCategory } from '../../../packages/patient-ai/safety/redFlags.ts';

export interface KnowledgeDoc {
  id: string;
  title: string;
  source: { org: 'WHO' | 'MoHFW' | 'NTEP' | 'NCDC'; url: string };
  reviewed: boolean;
  keywords: string[];
  body: string;
  /** Short first-aid steps shown, translated, when a matching red flag fires. */
  emergencySteps?: string[];
  emergencyFor?: RedFlagCategory[];
  followUps: string[];
}

export const KNOWLEDGE_BASE: KnowledgeDoc[] = [
  {
    id: 'diarrhoea-ors',
    title: 'Diarrhoea and ORS',
    source: { org: 'WHO', url: 'https://www.who.int/news-room/fact-sheets/detail/diarrhoeal-disease' },
    reviewed: false,
    keywords: ['diarrhoea', 'diarrhea', 'loose motion', 'loose motions', 'dehydration', 'ors', 'zinc', 'vomiting', 'dast', 'pechish', 'दस्त', 'ओआरएस', 'पानी की कमी', 'ulti', 'வயிற்றுப்போக்கு', 'ডায়রিয়া', 'পাতলা', 'পায়খানা', 'విరేచనాలు', 'जुलाब', 'ઝાડા', 'ಅತಿಸಾರ', 'ಭೇದಿ', 'വയറിളക്കം', 'ਦਸਤ', 'دست', 'اسہال', 'ଝାଡ଼ା'],
    body:
      'Diarrhoea causes loss of water and salts. Oral rehydration solution (ORS) replaces them and prevents dehydration. ' +
      'Give ORS after every loose stool and keep eating and breastfeeding. Children with diarrhoea should also get zinc tablets for 10 to 14 days as advised by a health worker. ' +
      'If ORS packets are not available, a home solution is 1 litre of clean drinking water with 6 level teaspoons of sugar and half a level teaspoon of salt. ' +
      'See a doctor quickly if there is blood in the stool, repeated vomiting, no urine for many hours, very dry mouth, sunken eyes, or if a child is unusually sleepy or will not drink.',
    followUps: ['How to make ORS at home?', 'When to see a doctor for diarrhoea?', 'What to eat during diarrhoea?'],
  },
  {
    id: 'dengue',
    title: 'Dengue: care and warning signs',
    source: { org: 'WHO', url: 'https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue' },
    reviewed: false,
    keywords: ['dengue', 'platelets', 'mosquito', 'high fever', 'body pain', 'rash', 'डेंगू', 'मच्छर', 'प्लेटलेट', 'டெங்கு', 'ডেঙ্গু', 'డెంగ్యూ', 'डेंग्यू', 'ડેન્ગ્યુ', 'ಡೆಂಗ್ಯೂ', 'ഡെങ്കി', 'ਡੇਂਗੂ', 'ڈینگی', 'ଡେଙ୍ଗୁ'],
    body:
      'Dengue is spread by mosquitoes and usually causes high fever, headache, pain behind the eyes, body and joint pain, and sometimes a rash. ' +
      'Rest, drink plenty of fluids, and use paracetamol for fever as advised. Avoid ibuprofen and aspirin, because they can increase bleeding risk. ' +
      'Go to a hospital immediately for warning signs, which often appear as the fever comes down: severe stomach pain, repeated vomiting, bleeding from gums or nose, blood in vomit or stool, fast breathing, extreme tiredness or restlessness. ' +
      'Prevent bites by removing standing water, using nets and repellents, and wearing full sleeves.',
    followUps: ['What are the danger signs of dengue?', 'Which fever medicine is safe in dengue?', 'How can I prevent mosquito bites?'],
  },
  {
    id: 'fever-care',
    title: 'Fever: home care and when to see a doctor',
    source: { org: 'MoHFW', url: 'https://www.mohfw.gov.in/' },
    reviewed: false,
    keywords: ['fever', 'temperature', 'bukhar', 'बुखार', 'paracetamol', 'chills', 'thand', 'காய்ச்சல்', 'জ্বর', 'జ్వరం', 'ताप', 'તાવ', 'ಜ್ವರ', 'പനി', 'ਬੁਖਾਰ', 'بخار', 'ଜ୍ୱର'],
    body:
      'For a mild fever: rest, drink plenty of fluids, wear light clothing and sponge with lukewarm water. Paracetamol can reduce fever; follow the dose on the label or from your doctor. ' +
      'See a doctor if the fever lasts more than 3 days, is very high, or comes with a rash, stiff neck, confusion, difficulty breathing, severe headache or repeated vomiting. ' +
      'Any fever in a baby younger than 3 months needs a doctor the same day.',
    followUps: ['When is a fever dangerous?', 'How do I bring down a fever at home?', 'Could my fever be dengue or malaria?'],
  },
  {
    id: 'heat-illness',
    title: 'Heat illness and heatstroke',
    source: { org: 'NCDC', url: 'https://ncdc.mohfw.gov.in/' },
    reviewed: false,
    keywords: ['heat', 'heatstroke', 'heat stroke', 'sunstroke', 'garmi', 'loo', 'लू', 'गर्मी', 'dehydration'],
    body:
      'In hot weather, drink water often even if you are not thirsty, avoid going out in the afternoon sun, wear light loose cotton clothes and cover your head. ' +
      'Heatstroke is an emergency: very high body temperature, hot dry skin, confusion, fainting or fits. Call 108, move the person to shade, loosen clothes and cool them with water and fanning.',
    emergencyFor: ['heatstroke'],
    emergencySteps: ['Call 108 now.', 'Move the person to a cool, shaded place.', 'Loosen tight clothes.', 'Cool the body with water and fanning.', 'Do not give anything to drink if they are confused or unconscious.'],
    followUps: ['How do I avoid heatstroke?', 'What are the signs of heatstroke?'],
  },
  {
    id: 'snakebite',
    title: 'Snakebite first aid',
    source: { org: 'WHO', url: 'https://www.who.int/news-room/fact-sheets/detail/snakebite-envenoming' },
    reviewed: false,
    keywords: ['snake', 'snakebite', 'bite', 'saanp', 'सांप', 'साँप', 'antivenom'],
    body:
      'After a snakebite, get to a hospital as fast as possible: antivenom is the only effective treatment. Keep the person calm and still, keep the bitten limb still, and remove rings, watches or tight clothing near the bite. ' +
      'Do not cut the wound, suck out venom, tie a tight band, apply ice or use herbal remedies, and do not wait for symptoms to appear.',
    emergencyFor: ['snakebite'],
    // One action per sentence: machine translation garbled a combined "do not cut, suck, or tie" step into Hindi.
    emergencySteps: ['Call 108 and go to the nearest hospital now.', 'Keep the person calm and still.', 'Keep the bitten arm or leg still.', 'Remove rings, watches and tight clothing.', 'Do not cut the bite.', 'Do not suck the bite.', 'Do not tie a rope or cloth tightly.'],
    followUps: ['What should I not do after a snakebite?'],
  },
  {
    id: 'hypertension',
    title: 'High blood pressure',
    source: { org: 'WHO', url: 'https://www.who.int/news-room/fact-sheets/detail/hypertension' },
    reviewed: false,
    keywords: ['blood pressure', 'bp', 'hypertension', 'high bp', 'salt', 'बीपी', 'रक्तचाप', 'namak', 'இரத்த அழுத்தம்', 'রক্তচাপ', 'రక్తపోటు', 'रक्तदाब', 'બ્લડ પ્રેશર', 'ರಕ್ತದೊತ್ತಡ', 'രക്തസമ്മർദ്ദം', 'ਬਲੱਡ ਪ੍ਰੈਸ਼ਰ', 'بلڈ پریشر'],
    body:
      'High blood pressure often has no symptoms, so check it regularly. Eat less salt (under 5 grams, about one teaspoon, a day in total), eat more vegetables and fruit, be active, avoid tobacco and limit alcohol. ' +
      'If medicine is prescribed, take it every day even when you feel well, and do not stop it without talking to your doctor.',
    followUps: ['How can I lower my BP naturally?', 'How much salt is safe per day?', 'Can I stop BP medicine if I feel fine?'],
  },
  {
    id: 'diabetes',
    title: 'Diabetes care',
    source: { org: 'WHO', url: 'https://www.who.int/news-room/fact-sheets/detail/diabetes' },
    reviewed: false,
    keywords: ['diabetes', 'sugar', 'blood sugar', 'insulin', 'madhumeh', 'शुगर', 'मधुमेह', 'low sugar', 'hypoglycemia', 'சர்க்கரை நோய்', 'ডায়াবেটিস', 'మధుమేహం', 'షుగర్', 'ડાયાબિટીસ', 'ಮಧುಮೇಹ', 'പ്രമേഹം', 'ਸ਼ੂਗਰ', 'شوگر', 'ذیابیطس'],
    body:
      'Diabetes is managed with healthy food, regular activity, a healthy weight, not smoking, and medicines or insulin as prescribed. Check your blood sugar as your doctor advises and look at your feet every day for cuts or sores. ' +
      'Low sugar can cause shaking, sweating, confusion or fainting: if the person is awake, give sugar, glucose or a sweet drink straight away and get medical help.',
    followUps: ['What foods are good for diabetes?', 'What should I do if my sugar is low?', 'Why should I check my feet?'],
  },
  {
    id: 'tuberculosis',
    title: 'Tuberculosis (TB)',
    source: { org: 'NTEP', url: 'https://tbcindia.gov.in/' },
    reviewed: false,
    keywords: ['tb', 'tuberculosis', 'cough', 'long cough', 'night sweats', 'weight loss', 'khansi', 'खांसी', 'टीबी', 'இருமல்', 'কাশি', 'దగ్గు', 'खोकला', 'ઉધરસ', 'ಕೆಮ್ಮು', 'ചുമ', 'ਖੰਘ', 'کھانسی', 'ଟିବି'],
    body:
      'A cough lasting more than 2 weeks, fever, night sweats or weight loss can be signs of TB. Get tested at a government health centre: TB testing and treatment are free under the National TB Elimination Programme. ' +
      'TB can be cured, but the full course of medicines must be completed even after you feel better.',
    followUps: ['Where can I get a free TB test?', 'Is TB curable?', 'Why must I finish the whole TB course?'],
  },
  {
    id: 'anaemia',
    title: 'Anaemia',
    source: { org: 'MoHFW', url: 'https://www.mohfw.gov.in/' },
    reviewed: false,
    keywords: ['anaemia', 'anemia', 'iron', 'haemoglobin', 'hemoglobin', 'weakness', 'tiredness', 'khoon ki kami', 'खून की कमी', 'ifa', 'இரத்த சோகை', 'রক্তাল্পতা', 'రక్తహీనత', 'रक्तक्षय', 'એનિમિયા', 'ರಕ್ತಹೀನತೆ', 'വിളർച്ച', 'ਖੂਨ ਦੀ ਕਮੀ', 'خون کی کمی'],
    body:
      'Anaemia means too little haemoglobin and causes tiredness, weakness, breathlessness and pale skin. Eat iron-rich foods such as green leafy vegetables, pulses, and eggs, meat or fish if you eat them, with vitamin C foods like lemon or amla to help absorption. ' +
      'Avoid tea or coffee with meals. Pregnant women and adolescents should take iron and folic acid (IFA) tablets as advised by the health worker.',
    followUps: ['Which foods are rich in iron?', 'Why is anaemia risky in pregnancy?'],
  },
];
