-- 5001: structured lab values for the doctor copilot's report comparison.
--
-- Reports (health_reports, 4001) are file metadata only. A doctor types the
-- values from a report (source 'manual'); 'extracted' is reserved for values
-- read from a report file later, which a doctor must still confirm.
--
-- Access mirrors health_reports (4001): whoever can view the patient can read;
-- a doctor with access can insert in their own name; the author can delete.
-- Re-runnable: create … if not exists, drop policy if exists.

create table if not exists public.lab_results (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  report_id       uuid references public.health_reports(id) on delete set null,
  test_code       text not null check (test_code ~ '^[a-z0-9_]{1,40}$'),
  test_name       text not null check (length(test_name) between 1 and 120),
  value           numeric not null,
  unit            text not null check (length(unit) between 1 and 30),
  reference_low   numeric,
  reference_high  numeric,
  observed_at     timestamptz not null,
  entered_by      uuid not null references public.profiles(id),
  source          text not null default 'manual' check (source in ('manual', 'extracted')),
  created_at      timestamptz not null default now(),
  constraint lab_results_reference_order check (reference_low is null or reference_high is null or reference_low <= reference_high)
);
create index if not exists lab_results_patient on public.lab_results (patient_id, test_code, observed_at desc);

alter table public.lab_results enable row level security;

drop policy if exists p5_lab_results_select on public.lab_results;
create policy p5_lab_results_select on public.lab_results for select to authenticated
  using (public.p4_can_view_patient(patient_id));

drop policy if exists p5_lab_results_insert on public.lab_results;
create policy p5_lab_results_insert on public.lab_results for insert to authenticated
  with check (
    entered_by = auth.uid()
    and public.p4_my_role() = 'doctor'
    and public.p4_can_view_patient(patient_id)
  );

drop policy if exists p5_lab_results_delete on public.lab_results;
create policy p5_lab_results_delete on public.lab_results for delete to authenticated
  using (entered_by = auth.uid() and public.p4_can_view_patient(patient_id));

-- No updates from clients: a wrong value is deleted and entered again, so the history stays honest.
revoke update on public.lab_results from authenticated;
revoke all on public.lab_results from anon;
