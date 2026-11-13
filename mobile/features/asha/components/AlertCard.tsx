import React from 'react';
import { Text, View } from 'react-native';
import { t } from '../data/i18n';
import { localizeAlert } from '../logic/rules';
import type { Lang, RiskAlert } from '../types';
import { Button, colors, RiskBadge, Row } from './ui';

export function AlertCard({
  alert,
  lang,
  patientName,
  onAck,
  onRefer,
  onOpen,
}: {
  alert: Pick<RiskAlert, 'severity' | 'reasonKey' | 'reasonParams' | 'source' | 'acknowledged'> & Partial<RiskAlert>;
  lang: Lang;
  patientName?: string;
  onAck?: () => void;
  onRefer?: () => void;
  onOpen?: () => void;
}) {
  const c = colors.risk[alert.severity];
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 12, padding: 12, gap: 6, opacity: alert.acknowledged ? 0.75 : 1 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <RiskBadge level={alert.severity} label={t(`risk.${alert.severity}`, lang)} />
        {patientName ? (
          <Text onPress={onOpen} style={{ fontWeight: '700', color: colors.text, flexShrink: 1 }} numberOfLines={1}>
            {patientName} ›
          </Text>
        ) : null}
      </Row>
      <Text style={{ color: colors.text, fontSize: 15 }}>{localizeAlert(alert as RiskAlert, lang)}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{alert.source}</Text>
      {onAck || onRefer ? (
        <Row style={{ marginTop: 4 }}>
          {onRefer ? <Button title={t('patient.refer', lang)} onPress={onRefer} variant="danger" style={{ flex: 1, minHeight: 42 }} /> : null}
          {onAck ? (
            <Button
              title={alert.acknowledged ? t('alerts.acked', lang) : t('alerts.ack', lang)}
              onPress={onAck}
              disabled={alert.acknowledged}
              variant="secondary"
              style={{ flex: 1, minHeight: 42 }}
            />
          ) : null}
        </Row>
      ) : null}
    </View>
  );
}
