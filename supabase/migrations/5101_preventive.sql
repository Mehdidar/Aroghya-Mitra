-- =============================================================================
-- 5101  Preventive care: vaccinations, growth, screenings, pregnancies and the
--       guideline versions the preventive plan is computed from
-- =============================================================================
-- Depends on 1000_base.sql (patients, profiles, p1_* helpers) and
-- 4001_p4_records.sql (p4_can_view_patient, p4_my_role).
--
-- Access (mirrors server/prevention/access.ts; keep in step):
--   read   patient: own record; ASHA: assigned patients; doctor/admin: facility,
--          open referral or valid QR grant (p4_can_view_patient)
--   write  ASHA: assigned patients, in their own name
--          doctor: patients they may view, in their own name
--          patient: self-reported past vaccines only (source 'self_reported')
-- The server uses the service role and applies the same rules itself.
-- Re-runnable: create ... if not exists, drop policy if exists.
-- The plan engine is packages/patient-ai/prevention (guideline rows below are
-- generated from packages/patient-ai/prevention/guidelines/*.ts).
-- =============================================================================

-- ------------------------------------------------------------------ tables
create table if not exists public.vaccination_records (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete cascade,
  vaccine_code text not null check (vaccine_code ~ '^[a-z_]{2,40}$'),
  dose         integer not null check (dose between 0 and 20),
  given_on     date not null,
  given_by     uuid references public.profiles(id) on delete set null,
  batch        text check (batch is null or length(batch) <= 60),
  source       text not null check (source in ('asha', 'doctor', 'facility', 'self_reported', 'demo')),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists vaccination_records_patient on public.vaccination_records (patient_id, given_on);

create table if not exists public.growth_measurements (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete cascade,
  measured_on  date not null,
  weight_kg    numeric(5, 2) check (weight_kg is null or weight_kg between 0.3 and 250),
  height_cm    numeric(5, 1) check (height_cm is null or height_cm between 20 and 250),
  muac_cm      numeric(4, 1) check (muac_cm is null or muac_cm between 5 and 50),
  measured_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint growth_measurements_has_value check (weight_kg is not null or height_cm is not null or muac_cm is not null)
);
create index if not exists growth_measurements_patient on public.growth_measurements (patient_id, measured_on);

-- `screened_by` is the spec's "by" (BY is an SQL keyword).
create table if not exists public.screening_results (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete cascade,
  kind         text not null check (kind in ('bp', 'sugar', 'hb', 'oral', 'breast', 'cervical', 'anc', 'ultrasound')),
  value        jsonb not null default '{}'::jsonb check (jsonb_typeof(value) = 'object'),
  screened_on  date not null,
  screened_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists screening_results_patient on public.screening_results (patient_id, kind, screened_on);

-- The current pregnancy (LMP) the ANC schedule is computed from.
create table if not exists public.pregnancies (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete cascade,
  lmp          date not null,
  gravida      integer check (gravida is null or gravida between 1 and 20),
  delivered_on date,
  recorded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists pregnancies_patient on public.pregnancies (patient_id, lmp desc);

create table if not exists public.guideline_versions (
  id           text not null,
  version      text not null,
  title        text not null,
  issuer       text not null,
  document     text,
  url          text,
  retrieved_on date,
  review_due   date not null,
  reviewed_by  uuid references public.profiles(id) on delete set null,
  status       text not null default 'needs_clinical_review' check (status in ('needs_clinical_review', 'reviewed', 'retired')),
  updated_at   timestamptz not null default now(),
  primary key (id, version)
);

-- ------------------------------------------------------------------ helpers
-- Read access: own record, ASHA caseload, or the P4 doctor/admin rules.
create or replace function public.p5_can_read_prevention(p_patient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.p1_is_own_patient(p_patient)
      or public.p1_is_my_asha_patient(p_patient)
      or public.p4_can_view_patient(p_patient)
$$;

-- Write access for health workers: the ASHA for her caseload, a doctor for patients they may view.
create or replace function public.p5_can_record_prevention(p_patient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.p1_is_my_asha_patient(p_patient)
      or (public.p4_my_role() = 'doctor' and public.p4_can_view_patient(p_patient))
$$;

-- ------------------------------------------------------- row-level security
alter table public.vaccination_records enable row level security;
alter table public.growth_measurements enable row level security;
alter table public.screening_results   enable row level security;
alter table public.pregnancies         enable row level security;
alter table public.guideline_versions  enable row level security;

-- vaccination_records
drop policy if exists p5_vaccinations_select on public.vaccination_records;
create policy p5_vaccinations_select on public.vaccination_records for select to authenticated
  using (public.p5_can_read_prevention(patient_id));
drop policy if exists p5_vaccinations_worker_insert on public.vaccination_records;
create policy p5_vaccinations_worker_insert on public.vaccination_records for insert to authenticated
  with check (public.p5_can_record_prevention(patient_id) and given_by = auth.uid() and created_by = auth.uid()
              and source in ('asha', 'doctor', 'facility'));
drop policy if exists p5_vaccinations_patient_insert on public.vaccination_records;
create policy p5_vaccinations_patient_insert on public.vaccination_records for insert to authenticated
  with check (public.p1_is_own_patient(patient_id) and source = 'self_reported' and given_by is null and created_by = auth.uid());
drop policy if exists p5_vaccinations_update on public.vaccination_records;
create policy p5_vaccinations_update on public.vaccination_records for update to authenticated
  using (created_by = auth.uid() and public.p5_can_read_prevention(patient_id))
  with check (created_by = auth.uid() and public.p5_can_read_prevention(patient_id));

-- growth_measurements
drop policy if exists p5_growth_select on public.growth_measurements;
create policy p5_growth_select on public.growth_measurements for select to authenticated
  using (public.p5_can_read_prevention(patient_id));
drop policy if exists p5_growth_insert on public.growth_measurements;
create policy p5_growth_insert on public.growth_measurements for insert to authenticated
  with check (public.p5_can_record_prevention(patient_id) and measured_by = auth.uid());
drop policy if exists p5_growth_update on public.growth_measurements;
create policy p5_growth_update on public.growth_measurements for update to authenticated
  using (measured_by = auth.uid() and public.p5_can_record_prevention(patient_id))
  with check (measured_by = auth.uid() and public.p5_can_record_prevention(patient_id));

-- screening_results
drop policy if exists p5_screening_select on public.screening_results;
create policy p5_screening_select on public.screening_results for select to authenticated
  using (public.p5_can_read_prevention(patient_id));
drop policy if exists p5_screening_insert on public.screening_results;
create policy p5_screening_insert on public.screening_results for insert to authenticated
  with check (public.p5_can_record_prevention(patient_id) and screened_by = auth.uid());
drop policy if exists p5_screening_update on public.screening_results;
create policy p5_screening_update on public.screening_results for update to authenticated
  using (screened_by = auth.uid() and public.p5_can_record_prevention(patient_id))
  with check (screened_by = auth.uid() and public.p5_can_record_prevention(patient_id));

-- pregnancies
drop policy if exists p5_pregnancies_select on public.pregnancies;
create policy p5_pregnancies_select on public.pregnancies for select to authenticated
  using (public.p5_can_read_prevention(patient_id));
drop policy if exists p5_pregnancies_insert on public.pregnancies;
create policy p5_pregnancies_insert on public.pregnancies for insert to authenticated
  with check (public.p5_can_record_prevention(patient_id) and recorded_by = auth.uid());
drop policy if exists p5_pregnancies_update on public.pregnancies;
create policy p5_pregnancies_update on public.pregnancies for update to authenticated
  using (public.p5_can_record_prevention(patient_id))
  with check (public.p5_can_record_prevention(patient_id) and recorded_by = auth.uid());

-- guideline_versions: anyone signed in may read; only the service role writes.
drop policy if exists p5_guidelines_select on public.guideline_versions;
create policy p5_guidelines_select on public.guideline_versions for select to authenticated using (true);

-- --------------------------------------------- guideline versions (data)
-- Clinical sign-off sets reviewed_by and status = 'reviewed'; re-running this
-- migration does not overwrite a review already recorded.
insert into public.guideline_versions (id, version, title, issuer, document, url, retrieved_on, review_due, reviewed_by, status) values
  ('in-mohfw-uip-nis', '2023 (fIPV 3rd dose; PCV nationwide)', 'National Immunization Schedule (Universal Immunization Programme)', 'MoHFW, Government of India', 'Universal Immunization Programme: National Immunization Schedule for Infants, Children and Pregnant Women', 'https://www.mohfw.gov.in/sites/default/files/Universal%20Immunization%20Programme.pdf', '2026-11-14'::date, '2027-05-14'::date, null, 'needs_clinical_review'),
  ('in-mohfw-anc', '2010 (ANC guidelines); MCP card 2018', 'Antenatal care: visits, tests and counselling', 'MoHFW, Government of India', 'Guidelines for Antenatal Care and Skilled Attendance at Birth by ANMs/LHVs/SNs; Mother and Child Protection (MCP) Card', null, null, '2027-05-14'::date, null, 'needs_clinical_review'),
  ('in-mohfw-pmsma', '2016', 'Pradhan Mantri Surakshit Matritva Abhiyan (PMSMA)', 'MoHFW, Government of India', 'PMSMA operational framework', null, null, '2027-05-14'::date, null, 'needs_clinical_review'),
  ('in-mohfw-calcium', '2014', 'Calcium supplementation during pregnancy and lactation', 'MoHFW (Maternal Health Division)', 'National Guidelines for Calcium Supplementation During Pregnancy and Lactation', null, null, '2027-05-14'::date, null, 'needs_clinical_review'),
  ('in-mohfw-hbnc', '2014', 'Home Based Newborn Care (HBNC) visits by ASHA', 'MoHFW / NHM', 'Home Based Newborn Care Operational Guidelines (revised)', null, null, '2027-05-14'::date, null, 'needs_clinical_review'),
  ('in-mohfw-amb', '2018', 'Anemia Mukt Bharat: prophylaxis, testing and treatment of anaemia', 'MoHFW, Government of India', 'Anemia Mukt Bharat: Intensified National Iron Plus Initiative (I-NIPI) Operational Guidelines for Programme Managers', 'https://anemiamuktbharat.info', '2026-11-14'::date, '2027-05-14'::date, null, 'needs_clinical_review'),
  ('in-mohfw-growth-who2006', 'MCP card 2018; WHO 2006', 'Child growth monitoring (WHO Child Growth Standards on the MCP card)', 'MoHFW / MWCD (MCP card); WHO (growth standards)', 'Mother and Child Protection Card; WHO Child Growth Standards: weight-for-age, length/height-for-age', 'https://www.who.int/tools/child-growth-standards', null, '2027-05-14'::date, null, 'needs_clinical_review'),
  ('in-mohfw-npncd', '2023-2030', 'Population-based screening for common NCDs (age 30+)', 'MoHFW, Government of India', 'National Programme for Prevention and Control of Non-Communicable Diseases (NP-NCD) Operational Guidelines', 'https://www.mohfw.gov.in/sites/default/files/NP-NCD%20Operational%20Guidelines_0.pdf', '2026-11-14'::date, '2027-05-14'::date, null, 'needs_clinical_review'),
  ('in-nhm-rbsk', '2013', 'Child health screening (RBSK): defects, diseases, deficiencies, developmental delays', 'NHM, MoHFW', 'Rashtriya Bal Swasthya Karyakram: Operational Guidelines', null, null, '2027-05-14'::date, null, 'needs_clinical_review')
on conflict (id, version) do update set
  title = excluded.title, issuer = excluded.issuer, document = excluded.document, url = excluded.url,
  retrieved_on = excluded.retrieved_on, review_due = excluded.review_due, updated_at = now()
  where public.guideline_versions.reviewed_by is null;
