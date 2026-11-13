-- =============================================================================
-- 1000  Base schema (P1): everything the ASHA (3001) and records (4001-4003)
--       migrations build on. Column names follow
--       packages/records/records/P1_SHARED_TYPES_REQUEST.md and @am/shared.
-- =============================================================================
-- Roles: patient, asha, doctor, admin (profiles.role).
-- Ids are uuid. The ASHA app generates UUIDs on the phone, so a record can be
-- created offline and upserted later with last-write-wins on updated_at.
-- RLS: each team's policies are permissive and OR-combined. This file adds
-- the patient, ASHA and admin policies (p1_*); P4 adds doctor-side p4_* in
-- 4002. Server-only tables (access_logs) have no client write policy.
-- =============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------- facilities
create table if not exists public.facilities (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,
  kind  text not null default 'phc' check (kind in ('phc', 'chc', 'district_hospital', 'private')),
  area  text
);

-- ------------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('patient', 'asha', 'doctor', 'admin')),
  full_name   text not null,
  phone       text,
  facility_id uuid references public.facilities(id),
  language    text not null default 'en',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists profiles_facility_role on public.profiles (facility_id, role) where is_active;

-- ------------------------------------------------------------------- patients
-- One row per person. Record-level columns (P4) and field-level columns the
-- ASHA app syncs (categories, pregnancy, newborn, home, risk_level) live on
-- the same row, so the doctor and the ASHA see the same patient.
create table if not exists public.patients (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,
  full_name          text not null,
  date_of_birth      date,
  sex                text check (sex in ('male', 'female', 'other')),
  phone              text,
  facility_id        uuid references public.facilities(id),
  asha_worker_id     uuid references public.profiles(id),
  area               text,
  address            text,
  blood_group        text check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  allergies          text[] not null default '{}',
  chronic_conditions text[] not null default '{}',
  -- ASHA field model
  categories         text[] not null default '{general}',
  pregnancy          jsonb,
  newborn            jsonb,
  home               jsonb,
  risk_level         text not null default 'none' check (risk_level in ('none', 'low', 'medium', 'high', 'critical')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists patients_user on public.patients (user_id);
create index if not exists patients_facility on public.patients (facility_id);
create index if not exists patients_asha on public.patients (asha_worker_id, updated_at);

-- --------------------------------------------------------------------- vitals
create table if not exists public.vitals (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  recorded_at     timestamptz not null default now(),
  recorded_by     uuid references public.profiles(id),
  source          text not null default 'self' check (source in ('asha_visit', 'consultation', 'self', 'device')),
  heart_rate      integer,
  systolic        integer,
  diastolic       integer,
  weight_kg       numeric(5,2),
  spo2            integer,
  temperature_c   numeric(4,1),
  blood_sugar_mg_dl integer,
  -- the full ASHA vitals object (hemoglobin, symptoms, fetal movement, ...)
  detail          jsonb
);
create index if not exists vitals_patient on public.vitals (patient_id, recorded_at desc);

-- -------------------------------------------------------------- prescriptions
create table if not exists public.prescriptions (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients(id) on delete cascade,
  prescribed_by uuid references public.profiles(id),   -- null for scanned paper prescriptions
  source        text not null default 'doctor' check (source in ('doctor', 'scan')),
  issued_at     timestamptz not null default now(),
  diagnosis     text,
  items         jsonb not null default '[]',
  notes         text
);
create index if not exists prescriptions_patient on public.prescriptions (patient_id, issued_at desc);

-- ------------------------------------------------------------------ dose logs
create table if not exists public.dose_logs (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  medicine_name   text not null,
  scheduled_at    timestamptz not null,
  status          text not null default 'pending' check (status in ('taken', 'missed', 'skipped', 'pending')),
  taken_at        timestamptz
);
create index if not exists dose_logs_patient on public.dose_logs (patient_id, scheduled_at desc);

-- ------------------------------------------------------------------ referrals
-- Created by the ASHA app (from_asha_id), actioned by a doctor (P4).
create table if not exists public.referrals (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients(id) on delete cascade,
  from_asha_id   uuid not null references public.profiles(id),
  to_doctor_id   uuid references public.profiles(id),
  to_facility_id uuid references public.facilities(id),
  reason         text not null,
  risk_alert_id  text,
  alert_ids      text[] not null default '{}',
  urgency        text not null default 'routine' check (urgency in ('routine', 'urgent', 'emergency')),
  status         text not null default 'pending' check (status in ('pending', 'seen', 'accepted', 'closed')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  seen_at        timestamptz,
  accepted_at    timestamptz
);
create index if not exists referrals_inbox on public.referrals (to_facility_id, status, urgency, created_at);
create index if not exists referrals_doctor on public.referrals (to_doctor_id, status);
create index if not exists referrals_asha on public.referrals (from_asha_id, updated_at);

-- -------------------------------------------------------------- consultations
create table if not exists public.consultations (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  doctor_id       uuid not null references public.profiles(id),
  facility_id     uuid references public.facilities(id),
  started_at      timestamptz not null default now(),
  notes           text,
  diagnosis       text,
  lab_orders      text[] not null default '{}',
  follow_up_date  date,
  prescription_id uuid references public.prescriptions(id),
  referral_id     uuid references public.referrals(id)
);
create index if not exists consultations_patient on public.consultations (patient_id, started_at desc);

-- ---------------------------------------------------------------- access logs
-- Written by the server (service role) only.
create table if not exists public.access_logs (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  viewer_id   uuid not null,
  viewer_role text not null check (viewer_role in ('patient', 'asha', 'doctor', 'admin')),
  viewer_name text,
  method      text not null check (method in ('qr_scan', 'direct')),
  outcome     text not null check (outcome in ('granted', 'denied')),
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists access_logs_patient on public.access_logs (patient_id, created_at desc);

-- ------------------------------------------------------------------- helpers
create or replace function public.p1_my_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.p1_my_facility()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.facility_id from public.profiles p where p.id = auth.uid() and p.is_active
$$;

-- The patient's own row (signed-in patient), or a patient assigned to the signed-in ASHA.
create or replace function public.p1_is_own_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.patients pt
    where pt.id = p_patient and pt.user_id = auth.uid()
      and exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_active and me.role = 'patient')
  )
$$;

create or replace function public.p1_is_my_asha_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.patients pt
    join public.profiles me on me.id = auth.uid() and me.is_active and me.role = 'asha'
    where pt.id = p_patient and pt.asha_worker_id = me.id
  )
$$;

-- updated_at bookkeeping for last-write-wins tables
create or replace function public.p1_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.updated_at is null or new.updated_at < old.updated_at then
    new.updated_at := old.updated_at;
  end if;
  return new;
end
$$;
drop trigger if exists p1_patients_touch on public.patients;
create trigger p1_patients_touch before update on public.patients for each row execute function public.p1_touch_updated_at();
drop trigger if exists p1_referrals_touch on public.referrals;
create trigger p1_referrals_touch before update on public.referrals for each row execute function public.p1_touch_updated_at();

-- -------------------------------------------------------- row-level security
alter table public.facilities    enable row level security;
alter table public.profiles      enable row level security;
alter table public.patients      enable row level security;
alter table public.vitals        enable row level security;
alter table public.prescriptions enable row level security;
alter table public.dose_logs     enable row level security;
alter table public.referrals     enable row level security;
alter table public.consultations enable row level security;
alter table public.access_logs   enable row level security;

-- facilities: any signed-in user can read the list
create policy p1_facilities_select on public.facilities for select to authenticated using (true);

-- profiles: own row (read + edit name/phone/language), ASHA workers of my facility readable by doctors
create policy p1_profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = public.p1_my_role());
create policy p1_profiles_staff_select on public.profiles for select to authenticated
  using (public.p1_my_role() in ('doctor', 'asha') and facility_id is not null and facility_id = public.p1_my_facility());

-- patients: the patient sees and edits their own row; the ASHA sees, registers and edits their caseload
create policy p1_patients_patient_select on public.patients for select to authenticated
  using (public.p1_is_own_patient(id));
create policy p1_patients_patient_update on public.patients for update to authenticated
  using (public.p1_is_own_patient(id)) with check (public.p1_is_own_patient(id));
create policy p1_patients_asha_select on public.patients for select to authenticated
  using (public.p1_is_my_asha_patient(id));
create policy p1_patients_asha_insert on public.patients for insert to authenticated
  with check (public.p1_my_role() = 'asha' and asha_worker_id = auth.uid()
              and (facility_id is null or facility_id = public.p1_my_facility()));
create policy p1_patients_asha_update on public.patients for update to authenticated
  using (public.p1_is_my_asha_patient(id)) with check (asha_worker_id = auth.uid());

-- vitals: patient reads own; ASHA reads/writes for their caseload; doctors go through P4's patient access
create policy p1_vitals_patient_select on public.vitals for select to authenticated
  using (public.p1_is_own_patient(patient_id));
create policy p1_vitals_patient_insert on public.vitals for insert to authenticated
  with check (public.p1_is_own_patient(patient_id) and source in ('self', 'device'));
create policy p1_vitals_asha_select on public.vitals for select to authenticated
  using (public.p1_is_my_asha_patient(patient_id));
create policy p1_vitals_asha_insert on public.vitals for insert to authenticated
  with check (public.p1_is_my_asha_patient(patient_id) and source = 'asha_visit' and recorded_by = auth.uid());
create policy p1_vitals_doctor_select on public.vitals for select to authenticated
  using (public.p1_my_role() in ('doctor', 'admin') and exists (
    select 1 from public.patients pt where pt.id = vitals.patient_id and pt.facility_id = public.p1_my_facility()));

-- prescriptions: the patient reads their own and adds scanned ones
create policy p1_prescriptions_patient_select on public.prescriptions for select to authenticated
  using (public.p1_is_own_patient(patient_id));
create policy p1_prescriptions_patient_insert on public.prescriptions for insert to authenticated
  with check (public.p1_is_own_patient(patient_id) and source = 'scan' and prescribed_by is null);

-- dose logs: the patient's own
create policy p1_dose_logs_patient_all on public.dose_logs for all to authenticated
  using (public.p1_is_own_patient(patient_id)) with check (public.p1_is_own_patient(patient_id));
create policy p1_dose_logs_doctor_select on public.dose_logs for select to authenticated
  using (public.p1_my_role() = 'doctor' and exists (
    select 1 from public.patients pt where pt.id = dose_logs.patient_id and pt.facility_id = public.p1_my_facility()));

-- referrals: the ASHA creates and follows their own; the patient sees theirs
create policy p1_referrals_asha_select on public.referrals for select to authenticated
  using (from_asha_id = auth.uid());
create policy p1_referrals_asha_insert on public.referrals for insert to authenticated
  with check (public.p1_my_role() = 'asha' and from_asha_id = auth.uid() and public.p1_is_my_asha_patient(patient_id));
create policy p1_referrals_asha_update on public.referrals for update to authenticated
  using (from_asha_id = auth.uid() and status = 'pending') with check (from_asha_id = auth.uid());
create policy p1_referrals_patient_select on public.referrals for select to authenticated
  using (public.p1_is_own_patient(patient_id));

-- consultations: the patient reads their own
create policy p1_consultations_patient_select on public.consultations for select to authenticated
  using (public.p1_is_own_patient(patient_id));

-- access logs: no client policy here (P4 adds the read policy; nobody writes from a client)
revoke insert, update, delete on public.access_logs from anon, authenticated;
revoke all on public.facilities, public.profiles, public.patients, public.vitals, public.prescriptions,
              public.dose_logs, public.referrals, public.consultations, public.access_logs from anon;
