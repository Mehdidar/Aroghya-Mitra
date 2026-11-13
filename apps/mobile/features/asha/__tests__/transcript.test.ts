import { mergeParsed, parseSymptoms, parseTranscript } from '../logic/transcript';

describe('parseTranscript (English)', () => {
  it('extracts BP, Hb, weight and symptoms', () => {
    const r = parseTranscript('BP is 150 by 100, hemoglobin 8.5, weight 56 kg. She has headache and swelling in hands.');
    expect(r).toMatchObject({ systolic: 150, diastolic: 100, hemoglobin: 8.5, weightKg: 56 });
    expect(r.symptoms).toEqual(expect.arrayContaining(['severe_headache', 'swelling_face_hands']));
  });
  it('converts spoken Fahrenheit to Celsius', () => {
    expect(parseTranscript('temperature 102').temperatureC).toBe(38.9);
    expect(parseTranscript('temp 37.5').temperatureC).toBe(37.5);
  });
  it('reads "7 point 5" as a decimal', () => {
    expect(parseTranscript('hb 7 point 5').hemoglobin).toBe(7.5);
  });
  it('respects simple negation', () => {
    expect(parseSymptoms('no fever, no bleeding, has headache')).toEqual(['severe_headache']);
  });
  it('does not read a number from the next clause', () => {
    expect(parseTranscript('no fever, pulse 100').temperatureC).toBeUndefined();
    expect(parseTranscript('no fever, pulse 100').pulse).toBe(100);
  });
  it('bare 140/90 is read as BP', () => {
    expect(parseTranscript('pressure reading 140/90')).toMatchObject({ systolic: 140, diastolic: 90 });
  });
  it('fetal movement and newborn signs', () => {
    expect(parseTranscript('baby movement is reduced since yesterday').fetalMovement).toBe('reduced');
    expect(parseTranscript('baby not feeding, breathing rate 66').symptoms).toContain('not_feeding');
    expect(parseTranscript('baby not feeding, breathing rate 66').respRate).toBe(66);
  });
  it('TB symptoms', () => {
    const s = parseSymptoms('cough for 3 weeks, night sweats, blood in sputum');
    expect(s).toEqual(expect.arrayContaining(['cough_2_weeks', 'night_sweats', 'hemoptysis']));
    expect(s).not.toContain('bleeding_pv');
  });
});

describe('parseTranscript (Hindi / Hinglish)', () => {
  it('extracts BP with बटा and Devanagari digits', () => {
    expect(parseTranscript('बीपी १५० बटा १००')).toMatchObject({ systolic: 150, diastolic: 100 });
  });
  it('extracts Hb, sugar and symptoms', () => {
    const r = parseTranscript('हीमोग्लोबिन 7, शुगर 250, सिरदर्द है, आंखों से धुंधला दिखता है');
    expect(r).toMatchObject({ hemoglobin: 7, bloodSugarRandom: 250 });
    expect(r.symptoms).toEqual(expect.arrayContaining(['severe_headache', 'blurred_vision']));
  });
  it('Hindi negation: बुखार नहीं', () => {
    expect(parseSymptoms('बुखार नहीं है, पेट में दर्द है')).toEqual(['severe_abdominal_pain']);
  });
  it('Hindi number words', () => {
    expect(parseTranscript('हीमोग्लोबिन आठ').hemoglobin).toBe(8);
  });
  it('TB in Hindi', () => {
    expect(parseSymptoms('दो हफ्ते से खांसी, बलगम में खून')).toEqual(expect.arrayContaining(['cough_2_weeks', 'hemoptysis']));
  });
  it('fetal movement in Hindi', () => {
    expect(parseTranscript('बच्चे की हलचल कम है').fetalMovement).toBe('reduced');
  });
});

describe('mergeParsed', () => {
  it('never overwrites values the ASHA typed and unions symptoms', () => {
    const { merged, filled } = mergeParsed({ systolic: 130, symptoms: ['fever'] }, { systolic: 150, diastolic: 95, symptoms: ['severe_headache'] });
    expect(merged.systolic).toBe(130);
    expect(merged.diastolic).toBe(95);
    expect(merged.symptoms).toEqual(['fever', 'severe_headache']);
    expect(filled).toEqual(['diastolic', 'symptoms']);
  });
});
