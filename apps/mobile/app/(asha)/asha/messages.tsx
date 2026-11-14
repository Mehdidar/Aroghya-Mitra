import { router, Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Screen } from '../../../features/asha/components/ui';
import type { Thread } from '../../../features/asha/connect/inbox';
import { ActionRow, Notice, formatWhen, urgentSigns, type T } from '../../../features/asha/connect/ui';
import { useAshaInbox } from '../../../features/asha/connect/useAshaInbox';
import { useAsha } from '../../../features/asha/store/AshaContext';
import { useTheme } from '../../../features/shared/theme';
import { EmptyState, SecondaryButton } from '../../../features/shared/ui';
import { ScreenGuide } from '@/features/shared/a11y/audioGuide';

/** One line about the newest message (or the most pressing open request) in a thread. */
function threadSummary(th: Thread, t: T): string {
  if (th.urgent) {
    const signs = urgentSigns(th.urgent, t);
    return [signs ? t('msg.urgentReason', { signs }) : t('msg.urgent'), th.urgent.body].filter(Boolean).join(' · ');
  }
  const req = th.openRequests[0];
  if (req) {
    const what = t(`msg.kind.${req.kind}`);
    const when = req.visitWhen ? t('msg.asksFor', { when: t(`msg.when.${req.visitWhen}`) }) : '';
    return [what, when, req.body].filter(Boolean).join(' · ');
  }
  const m = th.last;
  const text = m.kind === 'text' ? m.body : [t(`msg.kind.${m.kind}`), m.status ? t(`msg.status.${m.status}`) : ''].filter(Boolean).join(' · ');
  return m.from === 'asha' ? t('msg.fromYou', { text }) : text;
}

export default function AshaMessages() {
  const { t } = useAsha();
  const theme = useTheme();
  const inbox = useAshaInbox();

  const header = <Stack.Screen options={{ title: t('msg.title') }} />;

  if (!inbox.available) {
    return (
      <Screen testID="screen-asha-messages">
        {header}
        <ScreenGuide id="ashaMessages" button={false} />
        <EmptyState icon="cloud-offline-outline" title={t('msg.noServer')} body={t('msg.noServerBody')} testID="messages-no-server" />
      </Screen>
    );
  }

  const loading = inbox.status === 'loading' && !inbox.threads.length;
  return (
    <Screen testID="screen-asha-messages">
      {header}
      <ScreenGuide id="ashaMessages" button={false} />

      {inbox.status === 'offline' ? <Notice tone="neutral" icon="cloud-offline-outline" title={t('msg.offline')} testID="messages-offline" /> : null}
      {inbox.status === 'error' ? (
        <Notice tone="warning" icon="alert-circle-outline" title={t('msg.error')} testID="messages-error">
          <SecondaryButton label={t('msg.retry')} icon="refresh" onPress={() => void inbox.refresh()} />
        </Notice>
      ) : null}

      {loading ? (
        <View style={{ paddingVertical: theme.space[8], alignItems: 'center', gap: theme.space[3] }} accessibilityLabel={t('msg.loading')}>
          <ActivityIndicator size="large" color={theme.accent.accent} />
        </View>
      ) : inbox.threads.length === 0 ? (
        <EmptyState icon="chatbubbles-outline" title={t('msg.empty')} body={t('msg.emptyBody')} testID="messages-empty" />
      ) : (
        <View style={{ gap: theme.space[3] }}>
          {inbox.threads.map((th) => {
            const name = th.patient?.name ?? t('msg.unknownPatient');
            const parts = [threadSummary(th, t), formatWhen(th.last.createdAt)];
            if (!th.urgent && th.openRequests.length > 1) parts.unshift(t('msg.openRequests', { n: th.openRequests.length }));
            return (
              <ActionRow
                key={th.key}
                icon={th.urgent ? 'warning' : th.openRequests.length ? (th.openRequests[0].kind === 'call_request' ? 'call-outline' : 'home-outline') : 'chatbubble-outline'}
                tone={th.urgent ? 'danger' : th.openRequests.length ? 'warning' : 'accent'}
                title={name}
                subtitle={parts.filter(Boolean).join('\n')}
                badge={th.unread ? { text: String(th.unread), a11y: t('msg.unread', { n: th.unread }) } : undefined}
                onPress={() => router.push(`/asha/thread/${encodeURIComponent(th.patientId)}`)}
                testID={`thread-row-${th.patientId}`}
              />
            );
          })}
        </View>
      )}
    </Screen>
  );
}
