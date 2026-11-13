/**
 * Touch feedback in one place: a short vibration for key actions and, for
 * screen-reader users, a spoken confirmation of what just happened.
 * Never throws (web and devices without haptics just skip the vibration).
 */
import * as Haptics from 'expo-haptics';
import { AccessibilityInfo, Platform } from 'react-native';

const safe = (p: Promise<unknown>) => void p.catch(() => undefined);

export const feedback = {
  /** A light tap: start or stop recording, open a sheet. */
  tap() {
    if (Platform.OS !== 'web') safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** Something was saved or sent (dose taken, referral accepted, prescription saved). */
  success(announce?: string) {
    if (Platform.OS !== 'web') safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    if (announce) AccessibilityInfo.announceForAccessibility(announce);
  },
  /** A warning or a refusal. */
  warn(announce?: string) {
    if (Platform.OS !== 'web') safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
    if (announce) AccessibilityInfo.announceForAccessibility(announce);
  },
};
