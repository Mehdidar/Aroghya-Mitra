import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n from '@/features/shared/i18n';
import { ResultCard } from '@/features/shared/screens/NutritionScanScreen';
import { MOCK_RESULTS } from '@/features/shared/services/food/mock';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

describe('Nutrition result card', () => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('shows a recognised dish with macros for the estimated portion and recalculates', async () => {
    await render(wrap(<ResultCard result={{ recognition: MOCK_RESULTS[0], demo: true, demoReason: 'unset' }} />));
    expect(screen.getByText('Masala dosa')).toBeTruthy();
    expect(screen.getByText('Demo result')).toBeTruthy();
    // A demo sample ignores the photo, so it must not claim a match quality or a confidence.
    expect(screen.queryByText('Good match')).toBeNull();
    expect(screen.queryByText(/Confidence/)).toBeNull();
    expect(screen.getByLabelText('Energy 302 kcal')).toBeTruthy(); // 168 kcal/100 g x 180 g
    await fireEvent.press(screen.getByLabelText('More'));
    expect(screen.getByLabelText('Energy 344 kcal')).toBeTruthy(); // 205 g
  });

  it('shows match quality and confidence for a real (non-demo) result', async () => {
    await render(wrap(<ResultCard result={{ recognition: MOCK_RESULTS[0], demo: false }} />));
    expect(screen.queryByText('Demo result')).toBeNull();
    expect(screen.getByText('Good match')).toBeTruthy();
    expect(screen.getByText(/Confidence/)).toBeTruthy();
  });

  it('is honest when the dish is not recognised', async () => {
    await render(wrap(<ResultCard result={{ recognition: MOCK_RESULTS[2], demo: false }} />));
    expect(screen.getByText("We couldn't name this dish yet")).toBeTruthy();
    expect(screen.getByText('Uncertain: please check')).toBeTruthy();
    expect(screen.queryByText('Good match')).toBeNull();
  });

  it('shows diet tier, allergens, cautions and the extra nutrients for the portion', async () => {
    await render(wrap(<ResultCard result={{ recognition: MOCK_RESULTS[1], demo: false }} />));
    expect(screen.getByText('Non-vegetarian')).toBeTruthy();
    expect(screen.getByText('Contains: dairy, tree nuts')).toBeTruthy();
    expect(screen.getByText('Usually made with onion or garlic')).toBeTruthy();
    expect(screen.getByText('High blood pressure: moderately salty')).toBeTruthy();
    expect(screen.getByText(/Heart or cholesterol/)).toBeTruthy();
    expect(screen.getByLabelText('Sodium 1050 mg')).toBeTruthy(); // 420 mg/100 g x 250 g
    expect(screen.getByText(/typical recipe values/)).toBeTruthy();
  });

  it('says so when the usual recipe has no common allergens, and skips cautions it has none of', async () => {
    await render(wrap(<ResultCard result={{ recognition: MOCK_RESULTS[0], demo: false }} />));
    expect(screen.getByText('Vegetarian')).toBeTruthy();
    expect(screen.getByText('Contains: dairy')).toBeTruthy();
    expect(screen.queryByText('Take care if you have')).toBeNull();
  });

  it('renders in Hindi', async () => {
    await act(async () => {
      await i18n.changeLanguage('hi');
    });
    await render(wrap(<ResultCard result={{ recognition: MOCK_RESULTS[2], demo: true, demoReason: 'unreachable' }} />));
    expect(screen.getByText('हम अभी इस व्यंजन का नाम नहीं बता पाए')).toBeTruthy();
    expect(screen.getByText('डेमो नतीजा')).toBeTruthy();
  });
});
