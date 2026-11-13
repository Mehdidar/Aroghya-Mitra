-- =============================================================================
-- 3001  ASHA module (P3): home visits and rule-engine alerts.
-- =============================================================================
-- Patients and referrals live in the base tables (1000_base.sql): the ASHA
-- columns (categories, pregnancy, newborn, home, risk_level; referral urgency,
-- alert_ids, notes) are already on those rows. This file adds the two tables
-- only the ASHA app writes. Sync is last-write-wins on updated_at
-- (apps/mobile/features/asha/services/sync.ts); alert ids are deterministic
-- (`${patientId}:${ruleId}:${visitId}`), so re-sends are idempotent.
-- =============================================================================

create table if not exists public.asha_visits (
  id           uuid primary key,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  asha_id      uuid not null references public.profiles(id),
  visited_at   timestamptz not null,
  status       text not null check (status in ('completed', 'follow_up', 'referred', 'not_at_home')),
  gps          jsonb,
  vitals       jsonb,
  notes        text,
  photos       text[] not null default '{}',
  follow_up_on timestamptz,
  source       text not null default 'manual' check (source in ('manual', 'voice')),
  transcript   text,
  updated_at   timestamptz not null default now()
);
create index if not exists asha_visits_patient on public.asha_visits (patient_id, visited_at desc);
create index if not exists asha_visits_asha on public.asha_visits (asha_id, updated_at);

create table if not exists public.risk_alerts (
  id            text primary key,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  visit_id      uuid references public.asha_visits(id) on delete set null,
  asha_id       uuid references public.profiles(id),
  rule_id       text not null,
  severity      text not null check (severity in ('low', 'medium', 'high', 'critical')),
  reason        text not null,
  reason_key    text not null,
  reason_params jsonb not null default '{}',
  evidence      jsonb not null default '[]',
  source        text not null,
  -- 'phone' until server/risk has re-evaluated the visit; 'server' after. Doctors only see server-verified severity.
  verified_by   text not null default 'phone' check (verified_by in ('phone', 'server')),
  created_at    timestamptz not null,
  acknowledged  boolean not null default false,
  resolved_at   timestamptz
);
create index if not exists risk_alerts_open on public.risk_alerts (severity, created_at desc) where not acknowledged;
create index if not exists risk_alerts_patient on public.risk_alerts (patient_id, created_at desc);

drop trigger if exists p1_asha_visits_touch on public.asha_visits;
create trigger p1_asha_visits_touch before update on public.asha_visits for each row execute function public.p1_touch_updated_at();

-- -------------------------------------------------------- row-level security
alter table public.asha_visits enable row level security;
alter table public.risk_alerts enable row level security;

-- The ASHA: own visits and alerts for own caseload. The patient: own history. Doctors/admins: own facility.
drop policy if exists p3_visits_asha_all on public.asha_visits;
create policy p3_visits_asha_all on public.asha_visits for all to authenticated
  using (asha_id = auth.uid()) with check (asha_id = auth.uid() and public.p1_is_my_asha_patient(patient_id));
drop policy if exists p3_visits_patient_select on public.asha_visits;
create policy p3_visits_patient_select on public.asha_visits for select to authenticated
  using (public.p1_is_own_patient(patient_id));
drop policy if exists p3_visits_facility_select on public.asha_visits;
create policy p3_visits_facility_select on public.asha_visits for select to authenticated
  using (public.p1_my_role() in ('doctor', 'admin') and exists (
    select 1 from public.patients pt where pt.id = asha_visits.patient_id and pt.facility_id = public.p1_my_facility()));

drop policy if exists p3_alerts_asha_select on public.risk_alerts;
create policy p3_alerts_asha_select on public.risk_alerts for select to authenticated
  using (public.p1_is_my_asha_patient(patient_id));
drop policy if exists p3_alerts_asha_insert on public.risk_alerts;
create policy p3_alerts_asha_insert on public.risk_alerts for insert to authenticated
  with check (public.p1_is_my_asha_patient(patient_id) and verified_by = 'phone');
drop policy if exists p3_alerts_asha_update on public.risk_alerts;
create policy p3_alerts_asha_update on public.risk_alerts for update to authenticated
  using (public.p1_is_my_asha_patient(patient_id)) with check (public.p1_is_my_asha_patient(patient_id) and verified_by = 'phone');
drop policy if exists p3_alerts_patient_select on public.risk_alerts;
create policy p3_alerts_patient_select on public.risk_alerts for select to authenticated
  using (public.p1_is_own_patient(patient_id));
drop policy if exists p3_alerts_facility_select on public.risk_alerts;
create policy p3_alerts_facility_select on public.risk_alerts for select to authenticated
  using (public.p1_my_role() in ('doctor', 'admin') and verified_by = 'server' and exists (
    select 1 from public.patients pt where pt.id = risk_alerts.patient_id and pt.facility_id = public.p1_my_facility()));

revoke all on public.asha_visits, public.risk_alerts from anon;
