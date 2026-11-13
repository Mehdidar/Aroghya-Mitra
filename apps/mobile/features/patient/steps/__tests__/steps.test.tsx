import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n from '@/features/shared/i18n';

import { StepsCard } from '../StepsCard';
import { addSteps, dayKey, distanceKm, goalProgress, lastDays } from '../stepsLogic';

const mockPedometer = {
  isAvailableAsync: jest.fn(async () => true),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  getStepCountAsync: jest.fn(async (start: Date) => ({ steps: start.getDate() % 2 ? 4200 : 7300 })),
  watchStepCount: jest.fn(() => ({ remove: jest.fn() })),
};
jest.mock('expo-sensors', () => ({ Pedometer: mockPedometer }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

describe('step logic', () => {
  it('keys days in local time and lists the last 7 days ending today', () => {
    const now = new Date(2026, 10, 14, 23, 30);
    expect(dayKey(now)).toBe('2026-11-14');
    const days = lastDays(now);
    expect(days).toHaveLength(7);
    expect(dayKey(days[0])).toBe('2026-11-08');
    expect(dayKey(days[6])).toBe('2026-11-14');
  });

  it('adds only positive deltas and keeps two weeks', () => {
    let d: Record<string, number> = {};
    d = addSteps(d, '2026-11-14', 120);
    d = addSteps(d, '2026-11-14', -5);
    d = addSteps(d, '2026-11-14', 30);
    expect(d['2026-11-14']).toBe(150);
    for (let i = 1; i <= 20; i++) d = addSteps(d, `2026-10-${String(i).padStart(2, '0')}`, 1);
    expect(Object.keys(d)).toHaveLength(14);
    expect(d['2026-11-14']).toBe(150);
  });

  it('distance and goal progress', () => {
    expect(distanceKm(5000)).toBe(3.6);
    expect(goalProgress(3000, 6000)).toBe(0.5);
    expect(goalProgress(9000, 6000)).toBe(1);
  });
});

describe('StepsCard', () => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it("shows today's steps from the phone's sensor, never a made-up number", async () => {
    await render(wrap(<StepsCard />));
    const today = await screen.findByTestId('steps-today');
    const expected = new Date().getDate() % 2 ? '4,200' : '7,300';
    expect(String(today.props.children).replace(/[\u2066-\u2069]/g, "")).toBe(expected);
    expect(screen.getByText('Steps today')).toBeTruthy();
  });

  it('says so when the phone has no step sensor', async () => {
    mockPedometer.isAvailableAsync.mockResolvedValueOnce(false);
    await render(wrap(<StepsCard />));
    expect(await screen.findByText('Step counting works on your phone.')).toBeTruthy();
    expect(screen.queryByTestId('steps-today')).toBeNull();
  });
});
