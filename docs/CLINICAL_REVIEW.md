# Clinical review sheet

For the reviewing clinician. Generated from the app's code on 2026-11-13
(`npm run review:clinical`), so it shows exactly what the app does today.

**How to use it.** For each row, tick OK or Change; for a change, write the correct
value in the notes column. Please also sign at the end. The engineering team
applies the changes and marks the items reviewed in the code.

The app is a **screening and referral aid** for ASHA workers and patients. It
does not diagnose. Every alert tells the ASHA worker to refer.

---

## 1. ASHA home-visit risk rules (35)

These run on the ASHA's phone and again on the server (the server's result wins).
`bpHit(c, 140, 90)` means systolic ≥ 140 **or** diastolic ≥ 90. Severity drives
the colour and the referral urgency: critical = emergency referral today,
high = refer within 24 hours, medium = refer / follow up this week, low = advice
and follow-up.

| # | Rule | Severity | Applies to | Fires when (code) | Message shown to the ASHA | Source | Review | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | `preg_convulsions` | critical | pregnant women | any of these symptoms: convulsions | Convulsions in pregnancy (eclampsia). Emergency referral, call 108. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 2 | `preg_bleeding` | critical | pregnant women | any of these symptoms: bleeding pv | Bleeding per vagina in pregnancy. Emergency referral. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 3 | `preg_preeclampsia_signs` | critical | pregnant women | BP ≥ 140/90 mmHg (systolic ≥ 140 or diastolic ≥ 90) **and** any of these symptoms: severe headache, blurred vision, swelling face hands, severe abdominal pain | High BP ({sys}/{dia}) with danger signs ({signs}): possible pre-eclampsia. Refer immediately. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 4 | `preg_bp_severe` | critical | pregnant women | BP ≥ 160/110 mmHg (systolic ≥ 160 or diastolic ≥ 110) | Severe high BP in pregnancy ({sys}/{dia} mmHg). Refer to FRU today. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 5 | `preg_bp_high` | high | pregnant women | BP ≥ 140/90 mmHg (systolic ≥ 140 or diastolic ≥ 90) | High BP in pregnancy ({sys}/{dia} mmHg). Refer to PHC within 24 hours. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 6 | `preg_anaemia_severe` | critical | pregnant women | Hb (g/dL) < 7 | Severe anaemia in pregnancy (Hb {hb} g/dL). Refer for treatment. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 7 | `preg_anaemia_moderate` | medium | pregnant women | Hb (g/dL) < 10 | Moderate anaemia (Hb {hb} g/dL). Give IFA, check adherence, recheck in 4 weeks. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 8 | `preg_fetal_movement_absent` | critical | pregnant women from 20 weeks | fetal movement reported as absent | No fetal movement reported at {ga} weeks. Emergency referral. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 9 | `preg_fetal_movement_reduced` | high | pregnant women from 20 weeks | fetal movement reported as reduced | Reduced fetal movement at {ga} weeks. Refer for check-up today. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 10 | `preg_leaking` | high | pregnant women | symptom: leaking fluid | Leaking fluid per vagina at {ga} weeks. Refer to facility today. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 11 | `preg_abdominal_pain` | high | pregnant women | any of these symptoms: severe abdominal pain | Severe abdominal pain in pregnancy. Refer to facility today. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 12 | `preg_fever` | high | pregnant women | temperature (°C) ≥ 38 or symptom: fever | Fever in pregnancy ({temp} °C). Refer to PHC. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 13 | `preg_post_dates` | medium | pregnant women | gestation ≥ 41 weeks | Pregnancy at {ga} weeks, past due date. Arrange facility delivery. | MoHFW ANC guidelines | ☐ OK ☐ Change | |
| 14 | `nb_danger_sign` | critical | young infants (up to 59 days; up to 90 days if registered as a newborn) | any of these symptoms: not feeding, convulsions, chest indrawing, lethargy | Newborn danger sign: {signs}. Emergency referral to SNCU/FRU. | MoHFW HBNC / IMNCI young infant | ☐ OK ☐ Change | |
| 15 | `nb_fast_breathing` | high | young infants (up to 59 days; up to 90 days if registered as a newborn) | breathing rate (/min) ≥ 60 | Fast breathing in young infant ({rr}/min). Refer today (possible pneumonia). | MoHFW HBNC / IMNCI young infant | ☐ OK ☐ Change | |
| 16 | `nb_fever` | high | young infants (up to 59 days; up to 90 days if registered as a newborn) | temperature (°C) ≥ 37.5 or symptom: fever | Fever in young infant ({temp} °C). Refer today. | MoHFW HBNC / IMNCI young infant | ☐ OK ☐ Change | |
| 17 | `nb_hypothermia` | high | young infants (up to 59 days; up to 90 days if registered as a newborn) | temperature < 35.5 °C, or feels cold to touch | Baby is cold (hypothermia{tempText}). Skin-to-skin care and refer. | MoHFW HBNC / IMNCI young infant | ☐ OK ☐ Change | |
| 18 | `nb_jaundice` | high | young infants (up to 59 days; up to 90 days if registered as a newborn) | any of these symptoms: jaundice | Jaundice in newborn. Refer for bilirubin check. | MoHFW HBNC / IMNCI young infant | ☐ OK ☐ Change | |
| 19 | `nb_umbilical` | medium | young infants (up to 59 days; up to 90 days if registered as a newborn) | any of these symptoms: umbilical redness | Umbilical redness / infection. Clean, observe, refer if pus or spreading. | MoHFW HBNC / IMNCI young infant | ☐ OK ☐ Change | |
| 20 | `nb_lbw_very` | high | newborns with a recorded birth weight | birth weight < 1.5 kg | Very low birth weight ({bw} kg). Needs facility care. | MoHFW HBNC / IMNCI young infant | ☐ OK ☐ Change | |
| 21 | `nb_lbw` | medium | newborns with a recorded birth weight | birth weight < 2.5 kg | Low birth weight ({bw} kg). Extra home visits, KMC and breastfeeding support. | MoHFW HBNC / IMNCI young infant | ☐ OK ☐ Change | |
| 22 | `gen_spo2_critical` | critical | everyone | SpO₂ (%) < 90 | Very low oxygen (SpO₂ {spo2}%). Emergency referral, call 108. | General danger signs | ☐ OK ☐ Change | |
| 23 | `gen_spo2_low` | high | everyone | SpO₂ (%) < 94 | Low oxygen (SpO₂ {spo2}%). Refer to PHC today. | General danger signs | ☐ OK ☐ Change | |
| 24 | `gen_chest_pain_breathless` | critical | everyone except newborns | chest pain **and** breathlessness together | Chest pain with breathlessness. Emergency referral, call 108. | General danger signs | ☐ OK ☐ Change | |
| 25 | `gen_breathless` | high | everyone except newborns | any of these symptoms: breathlessness | Breathlessness. Refer to PHC today. | General danger signs | ☐ OK ☐ Change | |
| 26 | `gen_high_fever` | high | everyone except newborns | temperature (°C) ≥ 39.5 | High fever ({temp} °C). Test for malaria/dengue, refer if not settling. | General danger signs | ☐ OK ☐ Change | |
| 27 | `gen_fever` | medium | everyone except newborns | temperature (°C) ≥ 38 | Fever ({temp} °C). Give paracetamol, RDT for malaria, follow up in 2 days. | General danger signs | ☐ OK ☐ Change | |
| 28 | `gen_tachycardia` | high | age 12 and over | pulse (/min) ≥ 120 | Very fast pulse ({pulse}/min). Refer to PHC. | General danger signs | ☐ OK ☐ Change | |
| 29 | `ncd_bp_crisis` | critical | adults (18 and over) who are not pregnant | BP ≥ 180/120 mmHg (systolic ≥ 180 or diastolic ≥ 120) | Hypertensive crisis ({sys}/{dia} mmHg). Emergency referral. | NPCDCS screening | ☐ OK ☐ Change | |
| 30 | `ncd_bp_high` | medium | adults (18 and over) who are not pregnant | BP ≥ 140/90 mmHg (systolic ≥ 140 or diastolic ≥ 90) | Raised BP ({sys}/{dia} mmHg). Refer to PHC/CHO for confirmation and treatment. | NPCDCS screening | ☐ OK ☐ Change | |
| 31 | `ncd_hypoglycemia` | high | everyone except newborns | blood sugar (random, or fasting if no random) < 70 mg/dL | Low blood sugar ({sugar} mg/dL). Give sugar/glucose now, refer. | NPCDCS screening | ☐ OK ☐ Change | |
| 32 | `ncd_sugar_very_high` | high | everyone except newborns | random blood sugar (mg/dL) ≥ 300 | Very high blood sugar ({sugar} mg/dL). Refer to PHC today. | NPCDCS screening | ☐ OK ☐ Change | |
| 33 | `ncd_sugar_high` | medium | everyone except newborns | random blood sugar ≥ 200 mg/dL, or fasting blood sugar ≥ 126 mg/dL | High blood sugar ({sugar} mg/dL{kind}). Refer for diabetes confirmation. | NPCDCS screening | ☐ OK ☐ Change | |
| 34 | `tb_hemoptysis` | high | everyone except newborns | any of these symptoms: hemoptysis | Coughing blood. Refer to PHC today. | NTEP presumptive TB | ☐ OK ☐ Change | |
| 35 | `tb_presumptive` | high | everyone except newborns and people already on TB treatment | cough for 2 weeks or more; **or** any 2 of weight loss, night sweats, coughing blood; **or** fever plus any 1 of those | Presumptive TB ({signs}). Collect sputum / refer for NAAT test. | NTEP presumptive TB | ☐ OK ☐ Change | |

---

## 2. Chatbot health summaries (10)

The chatbot may only state medical facts from these summaries. Each one is
currently marked **not reviewed**.

### 2.1 Diarrhoea and ORS

Source it summarises: WHO, https://www.who.int/news-room/fact-sheets/detail/diarrhoeal-disease

> Diarrhoea causes loss of water and salts. Oral rehydration solution (ORS) replaces them and prevents dehydration. Give ORS after every loose stool and keep eating and breastfeeding. Children with diarrhoea should also get zinc tablets for 10 to 14 days as advised by a health worker. If ORS packets are not available, a home solution is 1 litre of clean drinking water with 6 level teaspoons of sugar and half a level teaspoon of salt. See a doctor quickly if there is blood in the stool, repeated vomiting, no urine for many hours, very dry mouth, sunken eyes, or if a child is unusually sleepy or will not drink.

☐ OK ☐ Change — notes: ______________________________________________

### 2.2 Dengue: care and warning signs

Source it summarises: WHO, https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue

> Dengue is spread by mosquitoes and usually causes high fever, headache, pain behind the eyes, body and joint pain, and sometimes a rash. Rest, drink plenty of fluids, and use paracetamol for fever as advised. Avoid ibuprofen and aspirin, because they can increase bleeding risk. Go to a hospital immediately for warning signs, which often appear as the fever comes down: severe stomach pain, repeated vomiting, bleeding from gums or nose, blood in vomit or stool, fast breathing, extreme tiredness or restlessness. Prevent bites by removing standing water, using nets and repellents, and wearing full sleeves.

☐ OK ☐ Change — notes: ______________________________________________

### 2.3 Fever: home care and when to see a doctor

Source it summarises: MoHFW, https://www.mohfw.gov.in/

> For a mild fever: rest, drink plenty of fluids, wear light clothing and sponge with lukewarm water. Paracetamol can reduce fever; follow the dose on the label or from your doctor. See a doctor if the fever lasts more than 3 days, is very high, or comes with a rash, stiff neck, confusion, difficulty breathing, severe headache or repeated vomiting. Any fever in a baby younger than 3 months needs a doctor the same day.

☐ OK ☐ Change — notes: ______________________________________________

### 2.4 Heat illness and heatstroke

Source it summarises: NCDC, https://ncdc.mohfw.gov.in/

> In hot weather, drink water often even if you are not thirsty, avoid going out in the afternoon sun, wear light loose cotton clothes and cover your head. Heatstroke is an emergency: very high body temperature, hot dry skin, confusion, fainting or fits. Call 108, move the person to shade, loosen clothes and cool them with water and fanning.

**First-aid steps shown in an emergency:**

1. Call 108 now.
2. Move the person to a cool, shaded place.
3. Loosen tight clothes.
4. Cool the body with water and fanning.
5. Do not give anything to drink if they are confused or unconscious.

☐ OK ☐ Change — notes: ______________________________________________

### 2.5 Snakebite first aid

Source it summarises: WHO, https://www.who.int/news-room/fact-sheets/detail/snakebite-envenoming

> After a snakebite, get to a hospital as fast as possible: antivenom is the only effective treatment. Keep the person calm and still, keep the bitten limb still, and remove rings, watches or tight clothing near the bite. Do not cut the wound, suck out venom, tie a tight band, apply ice or use herbal remedies, and do not wait for symptoms to appear.

**First-aid steps shown in an emergency:**

1. Call 108 and go to the nearest hospital now.
2. Keep the person calm and still.
3. Keep the bitten arm or leg still.
4. Remove rings, watches and tight clothing.
5. Do not cut the bite.
6. Do not suck the bite.
7. Do not tie a rope or cloth tightly.

☐ OK ☐ Change — notes: ______________________________________________

### 2.6 High blood pressure

Source it summarises: WHO, https://www.who.int/news-room/fact-sheets/detail/hypertension

> High blood pressure often has no symptoms, so check it regularly. Eat less salt (under 5 grams, about one teaspoon, a day in total), eat more vegetables and fruit, be active, avoid tobacco and limit alcohol. If medicine is prescribed, take it every day even when you feel well, and do not stop it without talking to your doctor.

☐ OK ☐ Change — notes: ______________________________________________

### 2.7 Diabetes care

Source it summarises: WHO, https://www.who.int/news-room/fact-sheets/detail/diabetes

> Diabetes is managed with healthy food, regular activity, a healthy weight, not smoking, and medicines or insulin as prescribed. Check your blood sugar as your doctor advises and look at your feet every day for cuts or sores. Low sugar can cause shaking, sweating, confusion or fainting: if the person is awake, give sugar, glucose or a sweet drink straight away and get medical help.

☐ OK ☐ Change — notes: ______________________________________________

### 2.8 Cough and cold: home care and when to see a doctor

Source it summarises: WHO, https://www.who.int/news-room/fact-sheets/detail/pneumonia

> Most coughs and colds are caused by common viral infections and get better on their own in 1 to 2 weeks. Rest, drink plenty of warm fluids, gargle with warm salt water for a sore throat, and use steam if the nose is blocked. Honey in warm water can soothe a cough in adults and children over 1 year. Do not take antibiotics unless a doctor prescribes them. See a doctor if the cough lasts more than 2 weeks (a free TB test is available at government health centres), if fever stays for more than 3 days, or if there is wheezing. Go to a hospital immediately for difficulty breathing, fast breathing in a child, chest pain, coughing up blood, or lips turning blue.

☐ OK ☐ Change — notes: ______________________________________________

### 2.9 Tuberculosis (TB)

Source it summarises: NTEP, https://tbcindia.gov.in/

> Coughing for more than 2 weeks, fever, night sweats or weight loss can be signs of TB. A few days of coughing with a cold is usually not TB. Get tested at a government health centre: TB testing and treatment are free under the National TB Elimination Programme. TB can be cured, but the full course of medicines must be completed even after you feel better.

☐ OK ☐ Change — notes: ______________________________________________

### 2.10 Anaemia

Source it summarises: MoHFW, https://www.mohfw.gov.in/

> Anaemia means too little haemoglobin and causes tiredness, weakness, breathlessness and pale skin. Eat iron-rich foods such as green leafy vegetables, pulses, and eggs, meat or fish if you eat them, with vitamin C foods like lemon or amla to help absorption. Avoid tea or coffee with meals. Pregnant women and adolescents should take iron and folic acid (IFA) tablets as advised by the health worker.

☐ OK ☐ Change — notes: ______________________________________________


---

## 3. Emergency phrases (show "Call 108" instantly)

If a patient types or says any of these, the app shows the emergency banner
before any AI answer. Please check two things: **nothing dangerous is missing**
(a missed emergency is the worst failure), and nothing common triggers it by
mistake. Languages other than English and Hindi also need a native speaker;
Odia, Assamese and Kashmiri were written without one.

### cardiac

| Language | Phrases | Review |
|---|---|---|
| en | chest pain · pain in my chest · pain in chest · chest tightness · tight chest · crushing chest · heart attack | ☐ OK ☐ Change |
| hinglish | seene me dard · seene mein dard · sine me dard · chhati me dard · chhati mein dard · chaati me dard · dil ka daura | ☐ OK ☐ Change |
| hi | सीने में दर्द · छाती में दर्द · दिल का दौरा · हार्ट अटैक | ☐ OK ☐ Change |
| ur | سینے میں درد · دل کا دورہ | ☐ OK ☐ Change |
| or | ଛାତି ଯନ୍ତ୍ରଣା · ଛାତିରେ ଯନ୍ତ୍ରଣା · ହୃଦ୍‌ଘାତ · ହାର୍ଟ ଆଟାକ | ☐ OK ☐ Change |
| as | বুকুৰ বিষ · বুকুত বিষ · হৃদৰোগৰ আক্ৰমণ · হাৰ্ট এটেক | ☐ OK ☐ Change |
| ks | سینس منز درد · دِلُک دورہ · ہارٹ اٹیک | ☐ OK ☐ Change |
| bn | বুকে ব্যথা · হার্ট অ্যাটাক | ☐ OK ☐ Change |
| ta | நெஞ்சு வலி · நெஞ்சுவலி · மாரடைப்பு | ☐ OK ☐ Change |
| te | ఛాతీ నొప్పి · గుండెపోటు · గుండె నొప్పి | ☐ OK ☐ Change |
| mr | छातीत दुख · हृदयविकाराचा झटका | ☐ OK ☐ Change |
| gu | છાતીમાં દુખાવો · હાર્ટ એટેક | ☐ OK ☐ Change |
| kn | ಎದೆ ನೋವು · ಹೃದಯಾಘಾತ | ☐ OK ☐ Change |
| ml | നെഞ്ചുവേദന · നെഞ്ച് വേദന · ഹൃദയാഘാതം | ☐ OK ☐ Change |
| pa | ਛਾਤੀ ਵਿੱਚ ਦਰਦ · ਦਿਲ ਦਾ ਦੌਰਾ | ☐ OK ☐ Change |

### breathing

| Language | Phrases | Review |
|---|---|---|
| en | can't breathe · cant breathe · cannot breathe · unable to breathe · difficulty breathing · trouble breathing · hard to breathe · short of breath · shortness of breath · not breathing · gasping for air · lips turning blue · lips are blue | ☐ OK ☐ Change |
| hinglish | saans nahi aa rahi · saans nahi le pa · saans lene me takleef · saans lene mein takleef · saans lene me dikkat · saans lene mein dikkat · saans phool rahi | ☐ OK ☐ Change |
| hi | सांस नहीं आ रही · साँस नहीं आ रही · सांस नहीं ले पा · सांस लेने में तकलीफ · साँस लेने में तकलीफ · सांस लेने में दिक्कत · साँस लेने में दिक्कत · सांस फूल रही | ☐ OK ☐ Change |
| ur | سانس نہیں آ رہی · سانس لینے میں تکلیف · سانس لینے میں دشواری | ☐ OK ☐ Change |
| or | ନିଶ୍ୱାସ ନେଇ ପାରୁନାହିଁ · ନିଶ୍ୱାସ ନେବାରେ କଷ୍ଟ · ଶ୍ୱାସକଷ୍ଟ | ☐ OK ☐ Change |
| as | উশাহ ল'ব নোৱাৰা · উশাহ লোৱাত কষ্ট · শ্বাসকষ্ট | ☐ OK ☐ Change |
| ks | شہ ہیکنس منز تکلیف · سانس نہٕ یوان · شٛہہ چھُ نہٕ یوان | ☐ OK ☐ Change |
| bn | শ্বাসকষ্ট · শ্বাস নিতে পারছি না · শ্বাস নিতে কষ্ট | ☐ OK ☐ Change |
| ta | மூச்சு திணறல் · மூச்சுத் திணறல் · மூச்சு விட முடியவில்லை | ☐ OK ☐ Change |
| te | ఊపిరి ఆడటం లేదు · శ్వాస తీసుకోవడం కష్టం | ☐ OK ☐ Change |
| mr | श्वास घेता येत नाही · श्वास घेण्यास त्रास | ☐ OK ☐ Change |
| gu | શ્વાસ લેવામાં તકલીફ · શ્વાસ નથી લેવાતો | ☐ OK ☐ Change |
| kn | ಉಸಿರಾಟದ ತೊಂದರೆ · ಉಸಿರು ಕಟ್ಟುತ್ತಿದೆ | ☐ OK ☐ Change |
| ml | ശ്വാസം മുട്ടൽ · ശ്വാസംമുട്ടൽ | ☐ OK ☐ Change |
| pa | ਸਾਹ ਲੈਣ ਵਿੱਚ ਤਕਲੀਫ਼ · ਸਾਹ ਨਹੀਂ ਆ ਰਿਹਾ | ☐ OK ☐ Change |

### stroke

| Language | Phrases | Review |
|---|---|---|
| en | stroke · face drooping · face is drooping · slurred speech · speech is slurred · weakness on one side · numbness on one side · one side of my body · one side of his body · one side of her body · paralysis · paralysed · paralyzed | ☐ OK ☐ Change |
| hinglish | lakwa · laqwa · muh tedha · munh tedha | ☐ OK ☐ Change |
| hi | लकवा · चेहरा टेढ़ा · मुंह टेढ़ा · मुँह टेढ़ा · एक तरफ कमजोरी | ☐ OK ☐ Change |
| ur | فالج · لقوہ | ☐ OK ☐ Change |
| or | ପକ୍ଷାଘାତ · ମୁହଁ ବଙ୍କା | ☐ OK ☐ Change |
| as | পক্ষাঘাত · মুখ বেঁকা | ☐ OK ☐ Change |
| ks | فالج · لقوہ | ☐ OK ☐ Change |
| bn | স্ট্রোক · পক্ষাঘাত | ☐ OK ☐ Change |
| ta | பக்கவாதம் | ☐ OK ☐ Change |
| te | పక్షవాతం | ☐ OK ☐ Change |
| mr | अर्धांगवायू · पक्षाघात | ☐ OK ☐ Change |
| gu | લકવો | ☐ OK ☐ Change |
| kn | ಪಾರ್ಶ್ವವಾಯು | ☐ OK ☐ Change |
| ml | പക്ഷാഘാതം | ☐ OK ☐ Change |
| pa | ਅਧਰੰਗ | ☐ OK ☐ Change |

### unconscious

| Language | Phrases | Review |
|---|---|---|
| en | unconscious · passed out · fainted · not waking up · won't wake up · unresponsive · collapsed | ☐ OK ☐ Change |
| hinglish | behosh · hosh nahi | ☐ OK ☐ Change |
| hi | बेहोश · होश नहीं | ☐ OK ☐ Change |
| ur | بے ہوش · بیہوش | ☐ OK ☐ Change |
| or | ଅଚେତ · ବେହୋସ · ଚେତା ହରାଇ | ☐ OK ☐ Change |
| as | অচেতন · বেহুঁচ · জ্ঞান হেৰুৱা | ☐ OK ☐ Change |
| ks | بے ہوش · بیہوش | ☐ OK ☐ Change |
| bn | অজ্ঞান | ☐ OK ☐ Change |
| ta | சுயநினைவு இல்லை · சுயநினைவு இழந் | ☐ OK ☐ Change |
| te | స్పృహ కోల్పోయ · స్పృహ లేదు | ☐ OK ☐ Change |
| mr | बेशुद्ध | ☐ OK ☐ Change |
| gu | બેભાન | ☐ OK ☐ Change |
| kn | ಪ್ರಜ್ಞೆ ತಪ್ಪಿ · ಪ್ರಜ್ಞಾಹೀನ | ☐ OK ☐ Change |
| ml | ബോധം പോയി · ബോധമില്ല | ☐ OK ☐ Change |
| pa | ਬੇਹੋਸ਼ | ☐ OK ☐ Change |

### seizure

| Language | Phrases | Review |
|---|---|---|
| en | seizure · seizures · convulsion · convulsions · having fits · having a fit | ☐ OK ☐ Change |
| hinglish | mirgi ka daura · daura pad · jhatke aa rahe | ☐ OK ☐ Change |
| hi | मिर्गी का दौरा · दौरा पड़ · झटके आ रहे | ☐ OK ☐ Change |
| ur | مرگی کا دورہ · دورہ پڑ | ☐ OK ☐ Change |
| or | ବାତ ମାରୁଛି · ଖିଞ୍ଚ ହେଉଛି · ମୃଗୀ | ☐ OK ☐ Change |
| as | মৃগী · খিচুনি | ☐ OK ☐ Change |
| ks | مرگی · دورٕ | ☐ OK ☐ Change |
| bn | খিঁচুনি | ☐ OK ☐ Change |
| ta | வலிப்பு | ☐ OK ☐ Change |
| te | మూర్ఛ · ఫిట్స్ | ☐ OK ☐ Change |
| mr | फेफरे · फिट येत | ☐ OK ☐ Change |
| gu | આંચકી | ☐ OK ☐ Change |
| kn | ಮೂರ್ಛೆ · ಫಿಟ್ಸ್ | ☐ OK ☐ Change |
| ml | അപസ്മാരം | ☐ OK ☐ Change |
| pa | ਦੌਰਾ ਪੈ · ਮਿਰਗੀ | ☐ OK ☐ Change |

### bleeding

| Language | Phrases | Review |
|---|---|---|
| en | heavy bleeding · bleeding heavily · bleeding a lot · won't stop bleeding · bleeding won't stop · bleeding will not stop · vomiting blood · coughing up blood · blood in vomit | ☐ OK ☐ Change |
| hinglish | khoon nahi ruk raha · bahut khoon · khoon ki ulti | ☐ OK ☐ Change |
| hi | खून नहीं रुक रहा · बहुत खून · खून की उल्टी · ज़्यादा खून · ज्यादा खून | ☐ OK ☐ Change |
| ur | خون نہیں رک رہا · بہت خون · خون کی الٹی | ☐ OK ☐ Change |
| or | ରକ୍ତ ବନ୍ଦ ହେଉନାହିଁ · ବହୁତ ରକ୍ତସ୍ରାବ | ☐ OK ☐ Change |
| as | তেজ বন্ধ হোৱা নাই · বহুত তেজ ওলাই | ☐ OK ☐ Change |
| ks | خون چھُ نہٕ رُکان · زیادٕ خون | ☐ OK ☐ Change |
| bn | রক্ত বন্ধ হচ্ছে না · রক্তবমি | ☐ OK ☐ Change |
| ta | இரத்தம் நிற்கவில்லை · ரத்தம் நிற்கவில்லை · இரத்த வாந்தி | ☐ OK ☐ Change |
| te | రక్తం ఆగడం లేదు · రక్తపు వాంతి | ☐ OK ☐ Change |
| mr | रक्त थांबत नाही · रक्ताची उलटी | ☐ OK ☐ Change |
| gu | લોહી બંધ નથી થતું · લોહીની ઉલટી | ☐ OK ☐ Change |
| kn | ರಕ್ತ ನಿಲ್ಲುತ್ತಿಲ್ಲ · ರಕ್ತ ವಾಂತಿ | ☐ OK ☐ Change |
| ml | രക്തം നിൽക്കുന്നില്ല · രക്തം ഛർദ്ദി | ☐ OK ☐ Change |
| pa | ਖੂਨ ਨਹੀਂ ਰੁਕ ਰਿਹਾ | ☐ OK ☐ Change |

### self_harm

| Language | Phrases | Review |
|---|---|---|
| en | suicide · suicidal · kill myself · end my life · want to die · don't want to live · dont want to live · self harm · self-harm · hurt myself | ☐ OK ☐ Change |
| hinglish | khudkushi · aatmahatya · atmahatya · mar jana chahta · mar jana chahti · jeena nahi chahta · jeena nahi chahti | ☐ OK ☐ Change |
| hi | आत्महत्या · खुदकुशी · ख़ुदकुशी · मर जाना चाहता · मर जाना चाहती · जीना नहीं चाहता · जीना नहीं चाहती · खुद को मार | ☐ OK ☐ Change |
| ur | خودکشی · مر جانا چاہتا · مر جانا چاہتی | ☐ OK ☐ Change |
| or | ମରିଯିବାକୁ ଚାହୁଁଛି · ଆତ୍ମହତ୍ୟା | ☐ OK ☐ Change |
| as | মৰিব খোজো · আত্মহত্যা | ☐ OK ☐ Change |
| ks | مرُن چھُم یژھان · خودکشی | ☐ OK ☐ Change |
| bn | আত্মহত্যা | ☐ OK ☐ Change |
| ta | தற்கொலை | ☐ OK ☐ Change |
| te | ఆత్మహత్య | ☐ OK ☐ Change |
| mr | जीव द्यायचा | ☐ OK ☐ Change |
| gu | આત્મહત્યા | ☐ OK ☐ Change |
| kn | ಆತ್ಮಹತ್ಯೆ | ☐ OK ☐ Change |
| ml | ആത്മഹത്യ | ☐ OK ☐ Change |
| pa | ਖੁਦਕੁਸ਼ੀ · ਆਤਮਹੱਤਿਆ | ☐ OK ☐ Change |

### poisoning

| Language | Phrases | Review |
|---|---|---|
| en | poison · poisoning · pesticide · rat poison · overdose · took too many tablets · took too many pills · swallowed bleach · drank kerosene | ☐ OK ☐ Change |
| hinglish | zeher · zehar · jahar · keetnashak | ☐ OK ☐ Change |
| hi | ज़हर · जहर · कीटनाशक · ओवरडोज़ · ओवरडोज | ☐ OK ☐ Change |
| ur | زہر | ☐ OK ☐ Change |
| or | ବିଷ ଖାଇ · ବିଷ ପିଇ · କୀଟନାଶକ ପିଇ | ☐ OK ☐ Change |
| as | বিহ খালে · বিহ খাইছে · কীটনাশক খাইছে | ☐ OK ☐ Change |
| ks | زہر کھیوو · زہر چیو | ☐ OK ☐ Change |
| bn | বিষ খেয়ে · কীটনাশক | ☐ OK ☐ Change |
| ta | விஷம் · பூச்சிக்கொல்லி | ☐ OK ☐ Change |
| te | విషం · పురుగుల మందు | ☐ OK ☐ Change |
| mr | विषबाधा · विष प्याय · कीटकनाशक | ☐ OK ☐ Change |
| gu | ઝેર | ☐ OK ☐ Change |
| kn | ವಿಷ ಕುಡಿದ · ವಿಷ ಸೇವನೆ | ☐ OK ☐ Change |
| ml | വിഷം | ☐ OK ☐ Change |
| pa | ਜ਼ਹਿਰ | ☐ OK ☐ Change |

### snakebite

| Language | Phrases | Review |
|---|---|---|
| en | snake bite · snakebite · bitten by a snake · snake bit | ☐ OK ☐ Change |
| hinglish | saanp ne kaat · sanp ne kaat · saap ne kaat · saanp ne kata · sanp ne kata | ☐ OK ☐ Change |
| hi | साँप ने काट · सांप ने काट · सर्पदंश | ☐ OK ☐ Change |
| ur | سانپ نے کاٹ | ☐ OK ☐ Change |
| or | ସାପ କାମୁଡ଼ି · ସାପ କାମୁଡ଼ା | ☐ OK ☐ Change |
| as | সাপে কামুৰিলে · সাপে খুটিলে | ☐ OK ☐ Change |
| ks | سرپُن ژٹُن · سرپن ژٹ | ☐ OK ☐ Change |
| bn | সাপে কেটেছে · সাপের কামড় | ☐ OK ☐ Change |
| ta | பாம்பு கடி | ☐ OK ☐ Change |
| te | పాము కాటు · పాము కరిచ | ☐ OK ☐ Change |
| mr | साप चावला | ☐ OK ☐ Change |
| gu | સાપ કરડ | ☐ OK ☐ Change |
| kn | ಹಾವು ಕಚ್ಚಿ · ಹಾವು ಕಡಿತ | ☐ OK ☐ Change |
| ml | പാമ്പ് കടിച്ചു · പാമ്പുകടി | ☐ OK ☐ Change |
| pa | ਸੱਪ ਨੇ ਡੰਗ | ☐ OK ☐ Change |

### burns

| Language | Phrases | Review |
|---|---|---|
| en | severe burn · badly burned · badly burnt · caught fire · acid attack | ☐ OK ☐ Change |
| hinglish | buri tarah jal · aag lag gayi | ☐ OK ☐ Change |
| hi | बुरी तरह जल · आग लग गई · तेज़ाब · तेजाब | ☐ OK ☐ Change |
| ur | بری طرح جل · تیزاب | ☐ OK ☐ Change |

### pregnancy

| Language | Phrases | Review |
|---|---|---|
| en | bleeding during pregnancy · pregnant and bleeding · water broke · waters broke · labour pain · labor pain · baby is not moving · baby not moving | ☐ OK ☐ Change |
| hinglish | pregnancy me bleeding · pregnancy mein bleeding · pani ki thaili phat | ☐ OK ☐ Change |
| hi | गर्भावस्था में खून · प्रसव पीड़ा · पानी की थैली फट · बच्चा हिल नहीं रहा | ☐ OK ☐ Change |
| ur | حمل میں خون · درد زہ | ☐ OK ☐ Change |

### choking

| Language | Phrases | Review |
|---|---|---|
| en | choking · something stuck in throat · stuck in his throat · stuck in her throat · stuck in my throat | ☐ OK ☐ Change |
| hinglish | gale me kuch phas · gale mein kuch phas · gale me atak | ☐ OK ☐ Change |
| hi | गले में कुछ फंस · गले में कुछ फँस · गले में अटक | ☐ OK ☐ Change |
| ur | گلے میں کچھ پھنس | ☐ OK ☐ Change |

### heatstroke

| Language | Phrases | Review |
|---|---|---|
| en | heat stroke · heatstroke · sunstroke · sun stroke | ☐ OK ☐ Change |
| hinglish | loo lag | ☐ OK ☐ Change |
| hi | लू लग | ☐ OK ☐ Change |
| ur | لو لگ | ☐ OK ☐ Change |


---

## Sign-off

Reviewed by: ______________________  Registration no.: ______________

Signature: ______________________  Date: ______________
