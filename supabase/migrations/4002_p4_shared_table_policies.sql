-- =============================================================================
-- 4002  P4 — access rules on shared tables (tables owned by P1)
-- =============================================================================
-- Postgres OR-combines permissive policies, so these only ADD access for
-- doctors/admins/patients as P4 needs; they do not remove access P1/P2/P3 grant
-- with their own policies. All P4 policy names start with `p4_`.
-- Requires P1's base tables (see 4001 header) plus:
--   public.prescriptions(id, patient_id, prescribed_by, ...)
--   public.consultations(id, patient_id, doctor_id, facility_id, ...)
--   public.access_logs(id, patient_id, viewer_id, viewer_role, viewer_name,
--                      method, outcome, reason, created_at)
-- =============================================================================

create or replace function public.p4_is_asha_of_my_facility(p_asha uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles a
    where a.id = p_asha and a.role = 'asha' and a.is_active
      and a.facility_id is not null and a.facility_id = public.p4_my_facility()
  )
$$;

alter table public.patients      enable row level security;
alter table public.prescriptions enable row level security;
alter table public.consultations enable row level security;
alter table public.referrals     enable row level security;
alter table public.access_logs   enable row level security;
alter table public.profiles      enable row level security;

-- --- patients ---------------------------------------------------------------
create policy p4_patients_select on public.patients for select to authenticated
  using (public.p4_can_view_patient(id));

-- Doctors and admins register patients at their own facility only.
create policy p4_patients_insert on public.patients for insert to authenticated
  with check (
    public.p4_my_role() in ('doctor', 'admin')
    and facility_id = public.p4_my_facility()
    and (asha_worker_id is null or public.p4_is_asha_of_my_facility(asha_worker_id))
  );

-- Edit (and assign to an ASHA worker of the same facility); cannot move a patient to another facility.
create policy p4_patients_update on public.patients for update to authenticated
  using (public.p4_my_role() in ('doctor', 'admin') and facility_id = public.p4_my_facility())
  with check (
    facility_id = public.p4_my_facility()
    and (asha_worker_id is null or public.p4_is_asha_of_my_facility(asha_worker_id))
  );

-- --- prescriptions ----------------------------------------------------------
create policy p4_prescriptions_select on public.prescriptions for select to authenticated
  using (public.p4_can_view_patient(patient_id));

-- A doctor writes prescriptions only in their own name and only for patients they can see.
create policy p4_prescriptions_insert on public.prescriptions for insert to authenticated
  with check (
    public.p4_my_role() = 'doctor'
    and prescribed_by = auth.uid()
    and public.p4_can_view_patient(patient_id)
  );

-- --- consultations ----------------------------------------------------------
create policy p4_consultations_select on public.consultations for select to authenticated
  using (public.p4_can_view_patient(patient_id));
create policy p4_consultations_insert on public.consultations for insert to authenticated
  with check (
    public.p4_my_role() = 'doctor'
    and doctor_id = auth.uid()
    and public.p4_can_view_patient(patient_id)
  );
create policy p4_consultations_update on public.consultations for update to authenticated
  using (doctor_id = auth.uid() and public.p4_my_role() = 'doctor')
  with check (doctor_id = auth.uid() and public.p4_can_view_patient(patient_id));

-- --- referrals (inbox) ------------------------------------------------------
create policy p4_referrals_select on public.referrals for select to authenticated
  using (
    public.p4_my_role() in ('doctor', 'admin')
    and (to_doctor_id = auth.uid()
         or (to_facility_id is not null and to_facility_id = public.p4_my_facility()))
  );
-- Accept / Mark seen / Close.
create policy p4_referrals_update on public.referrals for update to authenticated
  using (
    public.p4_my_role() = 'doctor'
    and (to_doctor_id = auth.uid()
         or (to_facility_id is not null and to_facility_id = public.p4_my_facility()))
  )
  with check (
    status in ('seen', 'accepted', 'closed')
    and (to_doctor_id = auth.uid()
         or (to_facility_id is not null and to_facility_id = public.p4_my_facility()))
  );

-- --- access logs: written by the server only, never edited ------------------
create policy p4_access_logs_select on public.access_logs for select to authenticated
  using (
    public.p4_is_my_patient_record(patient_id)
    or (public.p4_my_role() = 'admin' and exists (
          select 1 from public.patients pt
          where pt.id = access_logs.patient_id
            and pt.facility_id is not null
            and pt.facility_id = public.p4_my_facility()))
  );
revoke insert, update, delete on public.access_logs from anon, authenticated;

-- --- staff management (admin tools) -----------------------------------------
-- Everyone can read their own profile (so enabling RLS here never locks a user out).
create policy p4_profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid());

create policy p4_profiles_admin_select on public.profiles for select to authenticated
  using (
    public.p4_my_role() = 'admin'
    and facility_id is not null and facility_id = public.p4_my_facility()
  );
-- Approve / deactivate doctors and ASHA workers at the admin's own facility.
-- Cannot touch other admins (or themself), promote anyone, or move staff out.
create policy p4_profiles_admin_update on public.profiles for update to authenticated
  using (
    public.p4_my_role() = 'admin'
    and id <> auth.uid()
    and role in ('doctor', 'asha')
    and facility_id = public.p4_my_facility()
  )
  with check (
    role in ('doctor', 'asha')
    and facility_id = public.p4_my_facility()
  );
