import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AuthError, DEMO_OTP, getAuthService } from '@/features/shared/auth/AuthService';
import { ROLES, useSession, type Role } from '@/features/shared/state/session';
import { RoleScope, useTheme } from '@/features/shared/theme';
import { Card, Heading, Icon, IconButton, Pill, PrimaryButton, Screen, Text, TextField } from '@/features/shared/ui';

/** Phone OTP sign-in. Demo mode accepts 123456 (and says so); Supabase comes in Phase B. */
export default function PhoneSignIn() {
  const params = useLocalSearchParams<{ role?: string }>();
  const role: Role = ROLES.includes(params.role as Role) ? (params.role as Role) : 'patient';
  return (
    <RoleScope role={role}>
      <PhoneForm role={role} />
    </RoleScope>
  );
}

function PhoneForm({ role }: { role: Role }) {
  const { t } = useTranslation('auth');
  const theme = useTheme();
  const auth = useMemo(() => getAuthService(), []);
  const signIn = useSession((s) => s.signIn);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await auth.requestOtp(phone.replace(/\D/g, ''));
      setSentTo(r.phone);
    } catch (e) {
      setError(e instanceof AuthError && e.code === 'invalid_phone' ? t('phone.invalidPhone') : String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const user = await auth.verifyOtp(phone.replace(/\D/g, ''), code.trim(), role);
      signIn(user.role, 'phone');
    } catch (e) {
      setError(e instanceof AuthError && e.code === 'invalid_code' ? t('phone.invalidCode') : String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      background="hero"
      testID="screen-phone"
      footer={
        sentTo ? (
          <PrimaryButton label={t('phone.verify')} onPress={verify} loading={busy} disabled={code.length !== 6} testID="verify-code" />
        ) : (
          <PrimaryButton label={t('phone.sendCode')} onPress={send} loading={busy} disabled={phone.replace(/\D/g, '').length !== 10} testID="send-code" />
        )
      }>
      <View style={{ gap: theme.space[5] }}>
        <IconButton icon="arrow-back" variant="glass" flipInRTL accessibilityLabel={t('common:actions.back')} onPress={() => router.back()} />
        <View style={{ gap: theme.space[2] }}>
          <Pill label={t('phone.signingInAs', { role: t(`common:roles.${role}`) })} tone="accent" icon="person" />
          <Heading variant="h1">{t('phone.title')}</Heading>
          <Text tone="secondary">{t('phone.body')}</Text>
        </View>
        {auth.demo ? (
          <Card tone="accent">
            <View style={{ flexDirection: 'row', gap: theme.space[3], alignItems: 'center' }}>
              <Icon name="information-circle" color={theme.accent.accentIcon} />
              <Text variant="bodySmall" color={theme.accent.accentSoftText} style={{ flex: 1 }} testID="demo-otp-hint">
                {t('phone.demoHint')}
              </Text>
            </View>
          </Card>
        ) : null}
        <TextField
          label={t('phone.phoneLabel')}
          prefix="+91"
          numeric
          keyboardType="phone-pad"
          autoComplete="tel"
          maxLength={11}
          placeholder={t('phone.phonePlaceholder')}
          value={phone}
          onChangeText={(v) => {
            setPhone(v);
            if (sentTo) setSentTo(null);
          }}
          testID="phone-input"
          error={!sentTo ? (error ?? undefined) : undefined}
        />
        {sentTo ? (
          <TextField
            label={t('phone.codeLabel')}
            numeric
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            placeholder={auth.demo ? DEMO_OTP : '••••••'}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
            testID="code-input"
            hint={t('phone.codeSent', { phone: sentTo })}
            error={error ?? undefined}
          />
        ) : null}
      </View>
    </Screen>
  );
}
