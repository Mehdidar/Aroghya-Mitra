import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PatientReminders from '@/app/(patient)/(tabs)/reminders';
import PatientAssistant from '@/app/(patient)/assistant';
import { MedicineCard } from '@/features/patient/prescription/MedicineCard';
import { demoExtraction } from '@/features/patient/prescription/demoExtraction';
import { toPrescription, toReminderItems } from '@/features/patient/prescription/toReminders';
import { fieldsToConfirm, toReviewed } from '@/features/patient/prescription/types';
import { computeReminders } from '@/features/patient/reminders/useReminders';
import { localEmergency } from '@/features/patient/chat/useAiChat';
import { readSse } from '@/features/patient/chat/sse';
import { useRecords } from '@/features/shared/data/recordsStore';
import i18n from '@/features/shared/i18n';
import { useSession } from '@/features/shared/state/session';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

beforeEach(async () => {
  useSession.setState({ role: 'patient', language: 'en', onboarded: true });
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('AI chat', () => {
  it('shows a labelled demo reply when the server cannot be reached', async () => {
    const failing = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const realFetch = globalThis.fetch;
    globalThis.fetch = failing as unknown as typeof fetch;
    try {
      await render(wrap(<PatientAssistant />));
      await screen.findByText('How are you feeling?');
      fireEvent.press(screen.getByText('I have a fever'));
      await waitFor(() => expect(screen.getByText('Demo answer · server not reachable')).toBeTruthy());
      expect(screen.getByText(/^Demo answer: rest/)).toBeTruthy();
      expect(failing).toHaveBeenCalled();
      const [url] = failing.mock.calls[0] as unknown as [string];
      expect(url).toMatch(/\/ai\/chat$/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('raises the Call 108 banner on-device for a Hinglish red flag', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    try {
      await render(wrap(<PatientAssistant />));
      await screen.findByText('How are you feeling?');
      await act(async () => {
        fireEvent.changeText(screen.getByTestId('chat-input'), 'mujhe seene me dard ho raha hai');
      });
      await act(async () => {
        fireEvent.press(screen.getByTestId('chat-send'));
      });
      await waitFor(() => expect(screen.getByTestId('emergency-banner')).toBeTruthy());
      expect(screen.getByTestId('call-108')).toBeTruthy();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('localEmergency maps categories and contacts', () => {
    expect(localEmergency('I feel fine today')).toBeNull();
    const e = localEmergency('chest pain and cannot breathe');
    expect(e?.contacts.some((c) => c.number === '108')).toBe(true);
  });

  it('readSse parses data lines and ignores [DONE]', async () => {
    const body = 'data: {"type":"delta","text":"Hi"}\n\ndata: {"type":"done"}\ndata: [DONE]\n';
    const res = new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    const out: string[] = [];
    for await (const d of readSse(res)) out.push(d);
    expect(out).toEqual(['{"type":"delta","text":"Hi"}', '{"type":"done"}']);
  });
});

describe('Prescription review', () => {
  it('flags the low-confidence field and clears it once edited', async () => {
    const demo = demoExtraction();
    const med = toReviewed(demo.medicines[1], 1);
    expect(fieldsToConfirm(demo.medicines[1])).toEqual(['strength']);
    const onChange = jest.fn();
    await render(wrap(<MedicineCard med={med} onChange={onChange} onRemove={() => undefined} />));
    expect(screen.getAllByText('Confirm with pharmacist').length).toBeGreaterThan(0);
    fireEvent.changeText(screen.getByTestId('field-strength-1'), '100 mg + 500 mcg');
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0][0] as typeof med;
    expect(next.unsure).toEqual([]);
  });

  it('converts reviewed medicines to a scanned prescription and reminder items', () => {
    const meds = demoExtraction().medicines.map(toReviewed);
    const rx = toPrescription(meds, 'p1', new Date('2026-11-13T10:00:00Z'), 'rx-1');
    expect(rx.source).toBe('scan');
    expect(rx.items).toHaveLength(3);
    expect(rx.items[0].name).toBe('Labetalol 100 mg');
    const items = toReminderItems(meds, rx.id, new Date('2026-11-13T10:00:00Z'));
    expect(items[0]).toMatchObject({ id: 'rx-1:0', slots: ['morning', 'night'], durationDays: 30, startDate: '2026-11-13', prescriptionId: 'rx-1' });
  });
});

describe('Reminders', () => {
  beforeEach(() => {
    useRecords.getState().reset();
  });

  it('computes today\'s timeline from the seeded doctor prescription', () => {
    const { reminders, doseActions } = useRecords.getState();
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const r = computeReminders(reminders, doseActions, now);
    expect(r.meds.length).toBe(3);
    expect(r.timeline.map((t) => t.dose.medicineName)).toEqual(expect.arrayContaining(['Labetalol 100 mg', 'Calcium 500 mg']));
    expect(r.bySlot[0].slot).toBe('morning');
  });

  it('renders today\'s doses and marks one Taken', async () => {
    await render(wrap(<PatientReminders />));
    expect(await screen.findByText('Reminders')).toBeTruthy();
    expect(screen.getByTestId('stat-streak')).toBeTruthy();
    expect(screen.getAllByText('Labetalol 100 mg').length).toBeGreaterThan(0);
    const before = useRecords.getState().doseActions.length;
    const takenButtons = screen.getAllByTestId(/^taken-/);
    await act(async () => {
      fireEvent.press(takenButtons[0]);
    });
    expect(useRecords.getState().doseActions.length).toBe(before + 1);
    await waitFor(() => expect(screen.getAllByText('Taken').length).toBeGreaterThan(0));
  });
});
