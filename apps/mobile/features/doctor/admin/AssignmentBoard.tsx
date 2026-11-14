import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { assignPatient, getAssignmentBoard, setAshaAreas, type Board } from '@/features/ashaConnect/api';
import type { AshaLoad, AshaSuggestion, PatientAssignment } from '@/features/ashaConnect/types';
import { feedback } from '@/features/shared/feedback';
import { useTheme } from '@/features/shared/theme';
import { Avatar, Card, ErrorState, Pill, PrimaryButton, SecondaryButton, SectionHeader, Skeleton, Text, TextField } from '@/features/shared/ui';

/** Failure reasons from POST /asha/assign and PUT /asha/areas that have their own message. */
const KNOWN_ERRORS = ['offline', 'asha_inactive', 'no_asha', 'no_patient', 'not_permitted', 'forbidden_role'];

type Where = 'waiting' | 'all';
type Pending = { patient: PatientAssignment; ashaId: string | null; where: Where };
type Notice = { tone: 'success' | 'danger'; text: string };

const dateOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
};
const splitAreas = (s: string) => s.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean);

/** One ASHA as a selectable chip. Inactive ASHAs are shown but cannot be chosen (the server refuses them). */
function AshaChip({ asha, selected, onPress, testID }: { asha: AshaLoad; selected: boolean; onPress: () => void; testID: string }) {
  const th = useTheme();
  const { t } = useTranslation('doctor');
  const off = !asha.isActive;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: off }}
      accessibilityLabel={off ? t('admin.board.inactiveCannot', { name: asha.fullName }) : `${asha.fullName}, ${t('admin.board.caseload', { n: asha.caseload })}`}
      disabled={off}
      onPress={onPress}
      testID={testID}
      style={{
        minHeight: th.sizes.touchMin,
        paddingHorizontal: th.space[4],
        justifyContent: 'center',
        borderRadius: th.radii.full,
        borderWidth: 1.5,
        borderColor: selected ? th.accent.accent : th.colors.border,
        backgroundColor: selected ? th.accent.accentSoft : th.colors.surface,
        opacity: off ? 0.5 : 1,
      }}>
      <Text variant="bodySmall" weight={selected ? 'semibold' : 'regular'}>
        {off ? `${asha.fullName} · ${t('admin.board.inactive')}` : `${asha.fullName} · ${asha.caseload}`}
      </Text>
    </Pressable>
  );
}

/**
 * The PHC's ASHA assignment board, from the server (GET /asha/assignments).
 * The admin assigns, moves and removes patients and sets the villages each
 * ASHA covers; a doctor sees it read-only (the server says canEdit). Nothing
 * here is kept on the phone: without the server there is no board.
 */
export function AssignmentBoard() {
  const { t } = useTranslation('doctor');
  const th = useTheme();
  const [board, setBoard] = useState<Board | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  /** Patient whose ASHA chips are open, and from which list. */
  const [open, setOpen] = useState<{ id: string; where: Where } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [areaDrafts, setAreaDrafts] = useState<Record<string, string>>({});
  const alive = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getAssignmentBoard();
    if (!alive.current) return;
    setLoading(false);
    if (r.ok) {
      setBoard({ canEdit: r.canEdit, ashas: r.ashas, patients: r.patients });
      setLoadError(null);
      setAreaDrafts(Object.fromEntries(r.ashas.map((a) => [a.id, a.areas.join(', ')])));
    } else {
      setLoadError(r.reason);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const errorText = (reason: string) => t(`admin.board.errors.${KNOWN_ERRORS.includes(reason) ? reason : 'generic'}`);
  const ashaName = (id: string | null) => board?.ashas.find((a) => a.id === id)?.fullName ?? '';

  const assign = async (patient: PatientAssignment, ashaId: string | null) => {
    setBusy(true);
    setNotice(null);
    const reason = reasons[patient.id]?.trim() || undefined;
    const r = await assignPatient(patient.id, ashaId, reason);
    if (!alive.current) return;
    setBusy(false);
    setPending(null);
    if (r.ok) {
      const text = ashaId ? t('admin.board.assigned', { patient: patient.fullName, asha: ashaName(ashaId) }) : t('admin.board.removed', { patient: patient.fullName });
      feedback.success(text);
      setNotice({ tone: 'success', text });
      setOpen(null);
      setReasons((x) => ({ ...x, [patient.id]: '' }));
    } else {
      const text = errorText(r.reason);
      feedback.warn(text);
      setNotice({ tone: 'danger', text });
    }
    await load();
  };

  const saveAreas = async (asha: AshaLoad) => {
    setBusy(true);
    setNotice(null);
    const r = await setAshaAreas(asha.id, splitAreas(areaDrafts[asha.id] ?? ''));
    if (!alive.current) return;
    setBusy(false);
    if (r.ok) {
      const text = t('admin.board.villagesSaved', { asha: asha.fullName });
      feedback.success(text);
      setNotice({ tone: 'success', text });
    } else {
      const text = errorText(r.reason);
      feedback.warn(text);
      setNotice({ tone: 'danger', text });
    }
    await load();
  };

  if (!board) {
    return (
      <View style={{ gap: th.space[3] }} testID="assignment-board">
        <SectionHeader title={t('admin.assignments')} />
        {loading ? (
          <View style={{ gap: th.space[3] }} testID="board-loading" accessibilityLabel={t('admin.board.loading')}>
            <Skeleton height={88} />
            <Skeleton height={88} />
            <Skeleton height={88} />
          </View>
        ) : (
          <ErrorState
            title={loadError === 'offline' ? t('admin.board.needsServer') : loadError === 'forbidden_role' ? t('admin.board.notAllowed') : t('admin.board.loadFailed')}
            body={loadError === 'offline' ? t('admin.board.needsServerBody') : loadError === 'forbidden_role' ? undefined : t('admin.board.loadFailedBody')}
            retryLabel={t('retry')}
            onRetry={() => void load()}
            testID="board-error"
          />
        )}
      </View>
    );
  }

  const { canEdit, ashas, patients } = board;
  const waiting = patients.filter((p) => p.requestedAt || !p.ashaId);

  const suggestionText = (s: AshaSuggestion, p: PatientAssignment) =>
    s.match === 'area' && p.area ? t('admin.board.suggestArea', { name: s.fullName, area: p.area, n: s.caseload }) : t('admin.board.suggestFacility', { name: s.fullName, n: s.caseload });

  const chips = (p: PatientAssignment, where: Where, onPick: (ashaId: string) => void) => (
    <View style={{ gap: th.space[2] }}>
      <Text variant="label">{p.ashaId ? t('admin.board.moveTo') : t('admin.board.chooseAsha')}</Text>
      {ashas.filter((a) => a.id !== p.ashaId).length === 0 ? (
        <Text variant="bodySmall" tone="secondary">
          {t('admin.board.noOtherAsha')}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }} accessibilityRole="radiogroup">
          {ashas
            .filter((a) => a.id !== p.ashaId)
            .map((a) => (
              <AshaChip key={a.id} asha={a} selected={pending?.patient.id === p.id && pending.where === where && pending.ashaId === a.id} onPress={() => onPick(a.id)} testID={`pick-${where}-${p.id}-${a.id}`} />
            ))}
        </View>
      )}
    </View>
  );

  const confirmCard = (p: PatientAssignment, where: Where) => {
    if (!pending || pending.patient.id !== p.id || pending.where !== where) return null;
    const to = ashaName(pending.ashaId);
    const from = p.ashaName ?? ashaName(p.ashaId);
    const question = pending.ashaId === null ? t('admin.board.confirmRemove', { patient: p.fullName, from }) : p.ashaId ? t('admin.board.confirmMove', { patient: p.fullName, from, to }) : t('admin.board.confirmAssign', { patient: p.fullName, to });
    return (
      <View style={{ gap: th.space[2], padding: th.space[3], borderRadius: th.radii.lg, backgroundColor: th.colors.surfaceMuted }} accessibilityLiveRegion="polite" testID={`confirm-${p.id}`}>
        <Text weight="semibold">{question}</Text>
        <PrimaryButton label={t('admin.board.confirm')} icon="checkmark-circle" loading={busy} onPress={() => void assign(p, pending.ashaId)} testID={`confirm-yes-${p.id}`} />
        <SecondaryButton label={t('cancel')} disabled={busy} onPress={() => setPending(null)} testID={`confirm-no-${p.id}`} />
      </View>
    );
  };

  return (
    <View style={{ gap: th.space[5] }} testID="assignment-board">
      <View style={{ gap: th.space[3] }}>
        <SectionHeader title={t('admin.assignments')} actionLabel={t('admin.board.refresh')} onAction={() => void load()} />
        <Text variant="caption" tone="tertiary">
          {t('admin.board.serverNote')}
        </Text>
        {!canEdit ? <Pill label={t('admin.board.readOnly')} tone="info" icon="eye-outline" /> : null}
        {notice ? (
          <Text tone={notice.tone === 'success' ? 'accent' : 'danger'} weight="semibold" accessibilityLiveRegion="polite" testID="board-notice">
            {notice.text}
          </Text>
        ) : null}
      </View>

      {/* ------------------------------------------------ waiting */}
      <View style={{ gap: th.space[3] }} testID="board-waiting">
        <SectionHeader title={t('admin.board.waitingTitle', { n: waiting.length })} />
        {waiting.length === 0 ? (
          <Text tone="secondary">{t('admin.board.waitingNone')}</Text>
        ) : (
          waiting.map((p) => (
            <Card key={p.id} radius="lg" padding="md" testID={`waiting-${p.id}`}>
              <View style={{ gap: th.space[2] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space[3] }}>
                  <Avatar name={p.fullName} />
                  <View style={{ flex: 1 }}>
                    <Text variant="title">{p.fullName}</Text>
                    <Text variant="bodySmall" tone="secondary">
                      {[p.area ?? t('admin.board.noVillage'), p.requestedAt ? t('admin.board.askedOn', { date: dateOf(p.requestedAt) }) : t('admin.board.noAshaYet')].join(' · ')}
                    </Text>
                  </View>
                  {p.highRisk ? <Pill label={t('admin.board.highRiskPill')} tone="danger" icon="warning" /> : null}
                </View>
                {p.ashaId ? (
                  <Text variant="bodySmall">{t('admin.board.currentAsha', { name: p.ashaName ?? ashaName(p.ashaId) })}</Text>
                ) : p.suggestion ? (
                  <View style={{ gap: th.space[1] }}>
                    <Text variant="label">{t('admin.board.suggested')}</Text>
                    <Text variant="bodySmall" testID={`suggestion-${p.id}`}>
                      {suggestionText(p.suggestion, p)}
                    </Text>
                  </View>
                ) : (
                  <Text variant="bodySmall" tone="secondary">
                    {t('admin.board.noSuggestion')}
                  </Text>
                )}
                {canEdit ? (
                  <View style={{ gap: th.space[2] }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
                      {p.suggestion && !p.ashaId ? (
                        <PrimaryButton
                          label={t('admin.board.assignTo', { name: p.suggestion.fullName })}
                          icon="person-add-outline"
                          loading={busy}
                          onPress={() => void assign(p, p.suggestion!.ashaId)}
                          testID={`assign-suggested-${p.id}`}
                        />
                      ) : null}
                      <SecondaryButton
                        label={t('admin.board.chooseAnother')}
                        icon="people-outline"
                        onPress={() => setOpen((o) => (o?.id === p.id && o.where === 'waiting' ? null : { id: p.id, where: 'waiting' }))}
                        testID={`choose-${p.id}`}
                      />
                    </View>
                    {open?.id === p.id && open.where === 'waiting' ? chips(p, 'waiting', (ashaId) => (p.ashaId ? setPending({ patient: p, ashaId, where: 'waiting' }) : void assign(p, ashaId))) : null}
                    {confirmCard(p, 'waiting')}
                  </View>
                ) : null}
              </View>
            </Card>
          ))
        )}
      </View>

      {/* ------------------------------------------------ ASHAs */}
      <View style={{ gap: th.space[3] }} testID="board-ashas">
        <SectionHeader title={t('admin.board.ashasTitle')} />
        {ashas.length === 0 ? (
          <Text tone="secondary">{t('admin.board.noAshas')}</Text>
        ) : (
          ashas.map((a) => (
            <Card key={a.id} radius="lg" padding="md" testID={`asha-${a.id}`}>
              <View style={{ gap: th.space[2] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space[3] }}>
                  <Avatar name={a.fullName} />
                  <Text variant="title" style={{ flex: 1 }}>
                    {a.fullName}
                  </Text>
                  <Pill label={a.isActive ? t('admin.active') : t('admin.board.inactive')} tone={a.isActive ? 'success' : 'warning'} icon={a.isActive ? 'checkmark-circle' : 'pause-circle-outline'} />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space[2] }}>
                  <Pill label={t('admin.board.caseload', { n: a.caseload })} tone="neutral" icon="people-outline" />
                  <Pill label={t('admin.board.highRisk', { n: a.highRisk })} tone={a.highRisk ? 'danger' : 'neutral'} icon="warning-outline" />
                  <Pill label={t('admin.board.openRequests', { n: a.openRequests })} tone={a.openRequests ? 'warning' : 'neutral'} icon="chatbubble-ellipses-outline" />
                </View>
                {canEdit ? (
                  <View style={{ gap: th.space[2] }}>
                    <TextField
                      label={t('admin.board.villagesField')}
                      value={areaDrafts[a.id] ?? ''}
                      onChangeText={(v) => setAreaDrafts((x) => ({ ...x, [a.id]: v }))}
                      placeholder={t('admin.board.villagesHint')}
                      testID={`areas-${a.id}`}
                    />
                    <SecondaryButton label={t('admin.board.saveVillages')} icon="save-outline" disabled={busy} onPress={() => void saveAreas(a)} testID={`areas-save-${a.id}`} />
                  </View>
                ) : (
                  <Text variant="bodySmall" tone="secondary">
                    {a.areas.length ? t('admin.board.villages', { list: a.areas.join(', ') }) : t('admin.board.villagesNone')}
                  </Text>
                )}
              </View>
            </Card>
          ))
        )}
      </View>

      {/* ------------------------------------------------ all patients */}
      <View style={{ gap: th.space[3] }} testID="board-all">
        <SectionHeader title={t('admin.board.allTitle')} />
        {patients.length === 0 ? (
          <Text tone="secondary">{t('admin.board.noPatients')}</Text>
        ) : (
          patients.map((p) => (
            <Card key={p.id} radius="lg" padding="md" testID={`row-${p.id}`}>
              <View style={{ gap: th.space[2] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space[2] }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="title">{p.fullName}</Text>
                    <Text variant="bodySmall" tone="secondary">
                      {[p.area ?? t('admin.board.noVillage'), p.ashaId ? t('admin.board.currentAsha', { name: p.ashaName ?? ashaName(p.ashaId) }) : t('admin.board.noAsha')].join(' · ')}
                    </Text>
                  </View>
                  {p.highRisk ? <Pill label={t('admin.board.highRiskPill')} tone="danger" icon="warning" /> : null}
                </View>
                {p.lastChange ? (
                  <Text variant="caption" tone="tertiary">
                    {t('admin.board.lastChange', { method: t(`admin.board.method.${p.lastChange.method}`), date: dateOf(p.lastChange.createdAt) })}
                    {p.lastChange.reason ? ` · ${t('admin.board.reasonShown', { reason: p.lastChange.reason })}` : ''}
                  </Text>
                ) : null}
                {canEdit ? (
                  <View style={{ gap: th.space[2] }}>
                    <SecondaryButton
                      label={p.ashaId ? t('admin.board.move') : t('admin.board.assign')}
                      icon="swap-horizontal-outline"
                      onPress={() => {
                        setPending(null);
                        setOpen((o) => (o?.id === p.id && o.where === 'all' ? null : { id: p.id, where: 'all' }));
                      }}
                      testID={`move-${p.id}`}
                    />
                    {open?.id === p.id && open.where === 'all' ? (
                      <View style={{ gap: th.space[3] }}>
                        {chips(p, 'all', (ashaId) => setPending({ patient: p, ashaId, where: 'all' }))}
                        <TextField
                          label={t('admin.board.reason')}
                          value={reasons[p.id] ?? ''}
                          onChangeText={(v) => setReasons((x) => ({ ...x, [p.id]: v }))}
                          placeholder={t('admin.board.reasonHint')}
                          maxLength={200}
                          testID={`move-reason-${p.id}`}
                        />
                        {p.ashaId ? <SecondaryButton label={t('admin.board.remove')} icon="person-remove-outline" onPress={() => setPending({ patient: p, ashaId: null, where: 'all' })} testID={`remove-${p.id}`} /> : null}
                        {confirmCard(p, 'all')}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </Card>
          ))
        )}
      </View>
    </View>
  );
}
