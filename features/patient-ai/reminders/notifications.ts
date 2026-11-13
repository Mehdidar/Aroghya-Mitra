/**
 * expo-notifications adapter. The module is passed in (not imported) so this
 * file compiles and is unit-tested before the Expo app exists:
 *
 *   import * as Notifications from 'expo-notifications';
 *   import { Platform } from 'react-native';
 *   await ensureNotificationPermission(Notifications, Platform);
 *   await syncReminders(Notifications, planNotifications(meds, new Date()), copy);
 *
 * Android 13+ (API 33): POST_NOTIFICATIONS is a runtime permission, and the
 * system prompt only appears once a notification channel exists, so the
 * channel is created first. iOS: alert, sound and badge are requested explicitly.
 */
import type { NotificationPlan } from './schedule.ts';

export const DOSE_CHANNEL_ID = 'dose-reminders';
export const DOSE_CATEGORY_ID = 'dose-reminder';
export const ACTION_TAKEN = 'DOSE_TAKEN';
export const ACTION_SKIP = 'DOSE_SKIP';
const DATA_KIND = 'dose-reminder';

/** The parts of expo-notifications we use (structural, matches SDK 52+). */
export interface NotificationsModule {
  getPermissionsAsync(): Promise<PermissionResponse>;
  requestPermissionsAsync(request?: { ios?: { allowAlert?: boolean; allowSound?: boolean; allowBadge?: boolean } }): Promise<PermissionResponse>;
  setNotificationChannelAsync(id: string, channel: { name: string; importance: number; sound?: string | null; vibrationPattern?: number[]; enableVibrate?: boolean }): Promise<unknown>;
  setNotificationCategoryAsync(id: string, actions: { identifier: string; buttonTitle: string; options?: { opensAppToForeground?: boolean } }[]): Promise<unknown>;
  scheduleNotificationAsync(request: { identifier?: string; content: NotificationContent; trigger: { type: string; date: Date; channelId?: string } }): Promise<string>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  getAllScheduledNotificationsAsync(): Promise<{ identifier: string; content: { data?: Record<string, unknown> | null } }[]>;
  AndroidImportance: { HIGH: number };
  SchedulableTriggerInputTypes: { DATE: string };
}

export interface PermissionResponse {
  granted: boolean;
  canAskAgain: boolean;
  status?: string;
  ios?: { status?: number };
}

export interface NotificationContent {
  title: string;
  body: string;
  sound?: boolean | string;
  categoryIdentifier?: string;
  data: Record<string, unknown>;
}

export interface PlatformInfo {
  OS: 'ios' | 'android' | string;
  Version: number | string;
}

/** Translated strings, from P1's i18n. */
export interface ReminderCopy {
  channelName: string; // "Medicine reminders"
  taken: string; // "Taken"
  skip: string; // "Skip"
  title(names: string[]): string; // "Time for your medicine"
  body(names: string[]): string; // "Dolo 650, Pan-D"
}

export type PermissionState = 'granted' | 'denied' | 'blocked';

/**
 * Ask for notification permission. "blocked" means the user must enable it in system settings
 * (show a button that opens Linking.openSettings()).
 */
export async function ensureNotificationPermission(N: NotificationsModule, platform: PlatformInfo, copy: Pick<ReminderCopy, 'channelName' | 'taken' | 'skip'>): Promise<PermissionState> {
  if (platform.OS === 'android') {
    // Must exist before the Android 13+ permission prompt can appear.
    await N.setNotificationChannelAsync(DOSE_CHANNEL_ID, {
      name: copy.channelName,
      importance: N.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  await N.setNotificationCategoryAsync(DOSE_CATEGORY_ID, [
    { identifier: ACTION_TAKEN, buttonTitle: copy.taken, options: { opensAppToForeground: false } },
    { identifier: ACTION_SKIP, buttonTitle: copy.skip, options: { opensAppToForeground: false } },
  ]);

  const current = await N.getPermissionsAsync();
  if (isGranted(current)) return 'granted';
  if (!current.canAskAgain) return 'blocked';

  const asked = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: true } });
  if (isGranted(asked)) return 'granted';
  return asked.canAskAgain ? 'denied' : 'blocked';
}

/** iOS provisional (status 3) and ephemeral (4) authorisations also deliver notifications. */
function isGranted(p: PermissionResponse): boolean {
  return p.granted || p.ios?.status === 3 || p.ios?.status === 4;
}

export interface SyncResult {
  scheduled: number;
  cancelled: number;
  kept: number;
}

/**
 * Make the device's scheduled dose reminders match the plan exactly.
 * Idempotent: unchanged reminders are left alone; only our own notifications are touched.
 */
export async function syncReminders(N: NotificationsModule, plan: NotificationPlan[], copy: ReminderCopy): Promise<SyncResult> {
  const existing = (await N.getAllScheduledNotificationsAsync()).filter((n) => n.content.data?.kind === DATA_KIND);
  const wanted = new Map(plan.map((p) => [p.id, p]));
  const result: SyncResult = { scheduled: 0, cancelled: 0, kept: 0 };

  for (const n of existing) {
    const p = wanted.get(n.identifier);
    if (p && sameDoses(n.content.data?.doseIds, p.doseIds)) {
      wanted.delete(n.identifier);
      result.kept++;
    } else {
      await N.cancelScheduledNotificationAsync(n.identifier);
      result.cancelled++;
    }
  }

  for (const p of wanted.values()) {
    await N.scheduleNotificationAsync({
      identifier: p.id,
      content: {
        title: copy.title(p.medicineNames),
        body: copy.body(p.medicineNames),
        sound: 'default',
        categoryIdentifier: DOSE_CATEGORY_ID,
        data: { kind: DATA_KIND, doseIds: p.doseIds },
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: DOSE_CHANNEL_ID },
    });
    result.scheduled++;
  }
  return result;
}

function sameDoses(a: unknown, b: string[]): boolean {
  return Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Map a notification response (button tap or plain tap) to dose log entries.
 * Plain taps return no entries: open the timeline so the user can choose.
 */
export function doseActionsFromResponse(response: { actionIdentifier: string; notification: { request: { content: { data?: Record<string, unknown> | null } } } }, now: Date = new Date()) {
  const data = response.notification.request.content.data;
  if (data?.kind !== DATA_KIND || !Array.isArray(data.doseIds)) return [];
  const status = response.actionIdentifier === ACTION_TAKEN ? 'taken' : response.actionIdentifier === ACTION_SKIP ? 'skipped' : null;
  if (!status) return [];
  return (data.doseIds as string[]).map((doseId) => ({ doseId, status, at: now }) as const);
}
