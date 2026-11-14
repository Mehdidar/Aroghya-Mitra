/**
 * Small shared pieces for the appointment screens (patient, ASHA, doctor).
 * Every control is at least 48 pt and labelled for screen readers.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, Pressable, View } from 'react-native';

import { useLanguage } from '@/features/shared/i18n/useLanguage';
import { useTheme } from '@/features/shared/theme';
import { Card, Icon, Pill, PrimaryButton, SecondaryButton, Text, type IconName, type PillTone } from '@/features/shared/ui';

import { formatDay, formatTime, istDateOf } from './format';
import type { Appointment, AppointmentStatus } from './types';

export function Chip({ label, selected, onPress, testID, accessibilityLabel, disabled }: { label: string; selected: boolean; onPress: () => void; testID?: string; accessibilityLabel?: string; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: t.sizes.touchMin,
        minWidth: t.sizes.touchMin,
        paddingHorizontal: t.space[4],
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: t.radii.full,
        backgroundColor: selected ? t.colors.primary : pressed ? t.colors.surfaceSunken : t.colors.surface,
        borderWidth: 1,
        borderColor: selected ? t.colors.primary : t.colors.border,
        opacity: disabled ? 0.5 : 1,
      })}>
      <Text variant="bodySmall" weight="semibold" color={selected ? t.colors.onPrimary : t.colors.textPrimary}>
        {label}
      </Text>
    </Pressable>
  );
}

const STATUS_TONE: Record<AppointmentStatus, PillTone> = { booked: 'info', confirmed: 'success', cancelled: 'neutral', completed: 'success', no_show: 'warning' };

export function StatusPill({ appointment }: { appointment: Pick<Appointment, 'status' | 'cancelledReason'> }) {
  const { t } = useTranslation('appointments');
  const label = appointment.status === 'cancelled' && appointment.cancelledReason === 'rescheduled' ? t('status.rescheduled') : t(`status.${appointment.status}`);
  return <Pill label={label} tone={STATUS_TONE[appointment.status]} />;
}

/** One appointment: day, time, doctor, PHC, reason, status, and optional action buttons. */
export function AppointmentCard({ appointment: a, actions, showPatient, testID }: { appointment: Appointment; actions?: ReactNode; showPatient?: boolean; testID?: string }) {
  const { t } = useTranslation('appointments');
  const { language } = useLanguage();
  const th = useTheme();
  const day = formatDay(istDateOf(a.startsAt), language, true);
  const time = formatTime(a.startsAt, language);
  const doctor = a.doctorName ?? t('doctorFallback');
  const facility = a.facilityName ?? t('facilityFallback');
  return (
    <Card radius="xl" testID={testID}>
      <View accessible accessibilityLabel={[showPatient && a.patientName ? a.patientName : null, day, time, doctor, facility, a.reason].filter(Boolean).join(', ')} style={{ gap: th.space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: th.space[3] }}>
          <View style={{ flex: 1, gap: th.space[1] }}>
            {showPatient && a.patientName ? (
              <Text variant="title">{a.patientName}</Text>
            ) : null}
            <Text variant={showPatient ? 'bodyStrong' : 'title'}>{time}</Text>
            <Text variant="bodySmall" tone="secondary">
              {day}
            </Text>
          </View>
          <StatusPill appointment={a} />
        </View>
        <InfoLine icon="medkit-outline" text={doctor} />
        <InfoLine icon="business-outline" text={facility} />
        {a.reason ? <InfoLine icon="chatbox-ellipses-outline" text={a.reason} /> : null}
      </View>
      {actions ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>{actions}</View> : null}
    </Card>
  );
}

export function InfoLine({ icon, text }: { icon: IconName; text: string }) {
  const th = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space[2] }}>
      <Icon name={icon} size={th.sizes.icon.sm} color={th.colors.textSecondary} />
      <Text variant="bodySmall" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/** "Call the PHC" with the number, only when the PHC's number is actually known. */
export function CallPhcButton({ phone, testID }: { phone: string | null | undefined; testID?: string }) {
  const { t } = useTranslation('appointments');
  if (!phone) return null;
  return <SecondaryButton label={t('actions.call', { phone })} icon="call" onPress={() => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)} testID={testID ?? 'call-phc'} />;
}

/** A yes / no dialog that also works on web (Alert.alert does not). */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy,
  destructive,
  children,
  testID,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  destructive?: boolean;
  children?: ReactNode;
  testID?: string;
}) {
  const th = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} accessibilityViewIsModal>
      <View style={{ flex: 1, justifyContent: 'center', padding: th.space[5], backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View testID={testID} accessibilityRole="alert" style={{ backgroundColor: th.colors.surface, borderRadius: th.radii.xl, padding: th.space[5], gap: th.space[4], maxWidth: 480, width: '100%', alignSelf: 'center' }}>
          <Text variant="h3" accessibilityRole="header">
            {title}
          </Text>
          {body ? <Text tone="secondary">{body}</Text> : null}
          {children}
          <PrimaryButton label={confirmLabel} onPress={onConfirm} loading={busy} icon={destructive ? 'close-circle' : 'checkmark-circle'} testID={testID ? `${testID}-confirm` : undefined} />
          <SecondaryButton label={cancelLabel} onPress={onCancel} disabled={busy} testID={testID ? `${testID}-cancel` : undefined} />
        </View>
      </View>
    </Modal>
  );
}

/** A clear notice card (offline, info, warning). */
export function Notice({ icon, title, body, tone = 'muted', children, testID }: { icon: IconName; title: string; body?: string; tone?: 'muted' | 'surface'; children?: ReactNode; testID?: string }) {
  const th = useTheme();
  return (
    <Card tone={tone} radius="xl" testID={testID}>
      <View style={{ flexDirection: 'row', gap: th.space[3], alignItems: 'flex-start' }} accessible accessibilityRole="summary">
        <Icon name={icon} size={th.sizes.icon.md} color={th.colors.status.warning.icon} />
        <View style={{ flex: 1, gap: th.space[1] }}>
          <Text variant="bodyStrong">{title}</Text>
          {body ? (
            <Text variant="bodySmall" tone="secondary">
              {body}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </Card>
  );
}
