import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeForPrompt, parseDuration, parseYesNo, runCheck, type CheckOutcome } from './symptomCheck.ts';

const names = (o: CheckOutcome) => (o.kind === 'result' ? o.result.possibilities.map((p) => p.name) : []);
const asks = (o: CheckOutcome) => (o.kind === 'ask' ? o.question.id : o.kind);

describe('reading answers', () => {
  it('reads durations in English, Hinglish, Hindi and from chip labels', () => {
    assert.equal(parseDuration('for 3 weeks'), 21);
    assert.equal(parseDuration('do hafte se'), 14);
    assert.equal(parseDuration('तीन दिन से'), 3);
    assert.equal(parseDuration('since yesterday'), 1);
    assert.equal(parseDuration('2 months'), 60);
    assert.equal(parseDuration('More than 2 weeks', { id: 'duration', text: '', kind: 'duration', options: ['Less than 1 week', '1 to 2 weeks', 'More than 2 weeks'], optionDays: [3, 10, 21] }), 21);
    assert.equal(parseDuration('I feel tired'), null);
  });
  it('reads yes and no', () => {
    for (const y of ['Yes', 'haan', 'हाँ थोड़ा', 'yes, a little']) assert.equal(parseYesNo(y), true, y);
    for (const n of ['No', 'nahi', 'नहीं', 'no fever']) assert.equal(parseYesNo(n), false, n);
    assert.equal(parseYesNo('maybe tomorrow'), null);
  });
});

describe('cough check', () => {
  it('asks one question at a time, starting with how long', () => {
    assert.equal(asks(runCheck('cough', ['I have a cough'])), 'duration');
    assert.equal(asks(runCheck('cough', ['I have a cough', 'Less than 1 week'])), 'breathing');
  });

  it('a short cough with a runny nose is most likely a cold, never TB', () => {
    const o = runCheck('cough', ['I have a cough', 'Less than 1 week', 'No', 'No', 'No', 'Yes']);
    assert.equal(o.kind, 'result');
    assert.equal(names(o)[0], 'Common cold (a virus)');
    assert.ok(!names(o).some((n) => n.includes('TB')));
    assert.equal(o.kind === 'result' && o.result.urgency, 'home care');
  });

  it('a long cough with night sweats points to TB and a free test', () => {
    const o = runCheck('cough', ['mujhe 3 hafte se khansi hai', 'nahi', 'nahi', 'haan', 'haan', 'nahi']);
    assert.equal(o.kind, 'result');
    assert.equal(names(o)[0], 'Tuberculosis (TB)');
    assert.equal(o.kind === 'result' && o.result.possibilities[0].likelihood, 'more likely');
    assert.ok(o.kind === 'result' && o.result.actions[0].includes('TB test'));
  });

  it('uses what the patient already said and skips those questions', () => {
    const o = runCheck('cough', ['I have had a cough for 3 weeks with fever and night sweats']);
    assert.equal(asks(o), 'breathing'); // duration, fever and TB signs were already given
  });

  it('a yes to a danger sign stops the check with an emergency', () => {
    const o = runCheck('cough', ['I have a cough', '1 to 2 weeks', 'Yes']);
    assert.equal(o.kind, 'emergency');
    assert.equal(o.kind === 'emergency' && o.category, 'breathing');
  });

  it('"no blood" is read as no, not as blood', () => {
    const o = runCheck('cough', ['cough for 2 days, no blood, no fever']);
    assert.equal(asks(o), 'breathing');
  });

  it('a "no" for one sign does not cancel another', () => {
    const o = runCheck('cough', ['I have a cough and fever, no blood', 'Less than 1 week', 'No', 'No', 'No']);
    assert.equal(o.kind, 'result');
    assert.ok(names(o).includes('Flu or another viral infection'));
  });

  it('reads a Hindi "no" after the sign', () => {
    const o = runCheck('cough', ['मुझे दो दिन से खांसी है, बुखार नहीं है', 'नहीं', 'नहीं']);
    assert.equal(asks(o), 'cold_signs'); // fever was answered "no" in the first message
  });

  it('a reply that answers nothing moves on instead of looping', () => {
    let turns = ['I have a cough'];
    for (let i = 0; i < 10; i++) turns = [...turns, 'hmm I am not sure about that'];
    assert.equal(runCheck('cough', turns).kind, 'result');
  });
});

describe('fever check', () => {
  it('chills then sweating suggests a malaria test today', () => {
    const o = runCheck('fever', ['I have fever', '3 to 7 days', 'No', 'Yes', 'No', 'No', 'No']);
    assert.equal(names(o)[0], 'Malaria');
    assert.equal(o.kind === 'result' && o.result.urgency, 'see a doctor today');
  });
  it('a short fever with a cold is a viral infection, home care', () => {
    const o = runCheck('fever', ['bukhar hai', '1 to 2 days', 'nahi', 'nahi', 'nahi', 'nahi', 'haan']);
    assert.equal(names(o)[0], 'Flu, cold or another viral infection');
    assert.equal(o.kind === 'result' && o.result.urgency, 'home care');
  });
});

describe('diarrhoea check', () => {
  it('blood in the stool means a doctor today', () => {
    const o = runCheck('diarrhoea', ['I have loose motions', 'Less than 2 days', 'No', 'Yes', 'No', 'No']);
    assert.equal(names(o)[0], 'Dysentery (a bacterial stomach infection)');
    assert.equal(o.kind === 'result' && o.result.urgency, 'see a doctor today');
  });
  it('signs of water loss are an emergency', () => {
    assert.equal(runCheck('diarrhoea', ['I have loose motions', '2 days to 2 weeks', 'Yes']).kind, 'emergency');
  });
});

describe('prompt text', () => {
  it('tells the assistant to ask exactly the question, or to give possibilities without diagnosing', () => {
    assert.match(describeForPrompt(runCheck('cough', ['I have a cough'])), /ask exactly this one question[\s\S]*How long have you had the cough or cold\?/);
    const result = describeForPrompt(runCheck('cough', ['I have a cough', 'Less than 1 week', 'No', 'No', 'No', 'Yes']));
    assert.match(result, /Common cold/);
    assert.match(result, /not a diagnosis/);
  });
});

describe('a cold (2026-11-14: "I have cold" asked about a cough and then about cold signs again)', () => {
  it('counts "I have a cold" as cold signs and asks about the cough or cold, not the cough alone', () => {
    const first = runCheck('cough', ['I have a cold']);
    assert.equal(first.kind, 'ask');
    if (first.kind === 'ask') assert.equal(first.question.text, 'How long have you had the cough or cold?');
    const end = runCheck('cough', ['I have a cold', 'Less than 1 week', 'No', 'No', 'No']);
    assert.equal(end.kind, 'result');
    if (end.kind === 'result') {
      assert.equal(end.state.cold_signs, true, 'not asked again');
      assert.equal(end.result.possibilities[0].name, 'Common cold (a virus)');
    }
  });
  it('does not take "cold air" or "I feel cold" as a cold', () => {
    const s = runCheck('cough', ['I have a cough', 'Less than 1 week', 'No', 'No', 'No', 'it gets worse in cold air']);
    if (s.kind === 'result') assert.notEqual(s.state.cold_signs, true);
  });
});
