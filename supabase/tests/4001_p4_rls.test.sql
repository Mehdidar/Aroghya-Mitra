-- =============================================================================
-- P4 RLS tests: each block signs in as a role and tries to read or write data
-- that role must NOT reach, and checks it is refused. Runs in one transaction
-- and rolls back, so it leaves no data behind.
--
-- Run against a database with P1's base + 4001–4002 applied, e.g.
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/4001_p4_rls.test.sql
-- Any failure raises "RLS TEST FAILED: …" and aborts.
-- =============================================================================
begin;

-- --- tiny assertion helpers (rolled back with the transaction) -------------
create function public.p4t_check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'RLS TEST FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Statement must be refused with a permission / RLS error (SQLSTATE 42501).
create function public.p4t_denied(stmt text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when insufficient_privilege then
    raise notice 'ok - %', msg;
    return;
  end;
  raise exception 'RLS TEST FAILED: % (statement was allowed)', msg;
end $$;

-- Rows affected by an UPDATE/DELETE (RLS hides rows rather than erroring).
create function public.p4t_rows(stmt text) returns integer language plpgsql as $$
declare n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.p4t_check(boolean, text), public.p4t_denied(text, text), public.p4t_rows(text)
  to authenticated;

-- --- fixtures (as the migration owner, RLS bypassed) -----------------------
-- Facilities A and B.
insert into public.facilities (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'PHC Hebbal'),
  ('00000000-0000-0000-0000-0000000000b1', 'CHC Yelahanka');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'p1@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'p2@test.local'),
  ('00000000-0000-0000-0000-000000000011', 'docA@test.local'),
  ('00000000-0000-0000-0000-000000000012', 'docA-off@test.local'),
  ('00000000-0000-0000-0000-000000000021', 'docB@test.local'),
  ('00000000-0000-0000-0000-000000000022', 'docB2@test.local'),
  ('00000000-0000-0000-0000-000000000031', 'adminA@test.local'),
  ('00000000-0000-0000-0000-000000000032', 'adminB@test.local'),
  ('00000000-0000-0000-0000-000000000041', 'ashaA@test.local'),
  ('00000000-0000-0000-0000-000000000042', 'ashaB@test.local');

insert into public.profiles (id, role, full_name, facility_id, is_active) values
  ('00000000-0000-0000-0000-000000000001', 'patient', 'Patient One', null, true),
  ('00000000-0000-0000-0000-000000000002', 'patient', 'Patient Two', null, true),
  ('00000000-0000-0000-0000-000000000011', 'doctor', 'Dr A', '00000000-0000-0000-0000-0000000000a1', true),
  ('00000000-0000-0000-0000-000000000012', 'doctor', 'Dr A (deactivated)', '00000000-0000-0000-0000-0000000000a1', false),
  ('00000000-0000-0000-0000-000000000021', 'doctor', 'Dr B', '00000000-0000-0000-0000-0000000000b1', true),
  ('00000000-0000-0000-0000-000000000022', 'doctor', 'Dr B2', '00000000-0000-0000-0000-0000000000b1', true),
  ('00000000-0000-0000-0000-000000000031', 'admin', 'Admin A', '00000000-0000-0000-0000-0000000000a1', true),
  ('00000000-0000-0000-0000-000000000032', 'admin', 'Admin B', '00000000-0000-0000-0000-0000000000b1', true),
  ('00000000-0000-0000-0000-000000000041', 'asha', 'ASHA A', '00000000-0000-0000-0000-0000000000a1', true),
  ('00000000-0000-0000-0000-000000000042', 'asha', 'ASHA B', '00000000-0000-0000-0000-0000000000b1', true);

-- Patient 1 at facility A, patient 2 at facility B.
insert into public.patients (id, user_id, full_name, facility_id, asha_worker_id) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Patient One',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000002', 'Patient Two',
   '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000042');

insert into public.patient_consents (patient_id, share_history) values
  ('00000000-0000-0000-0000-000000000101', true),
  ('00000000-0000-0000-0000-000000000102', false);

insert into public.prescriptions (patient_id, prescribed_by) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000011');
insert into public.consultations (patient_id, doctor_id, facility_id, diagnosis) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-0000000000a1', 'Hypertension');
insert into public.health_reports (patient_id, uploaded_by, category, title, storage_path, mime_type, size_bytes) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'blood_test', 'HbA1c',
   '00000000-0000-0000-0000-000000000101/hba1c.pdf', 'application/pdf', 1000);
insert into public.access_logs (patient_id, viewer_id, viewer_role, viewer_name, method, outcome, reason) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000011', 'doctor', 'Dr A',
   'direct', 'granted', 'facility');
insert into public.qr_token_redemptions (jti, patient_id, viewer_id) values
  ('jti-1', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000011');

insert into public.blood_banks (id, name, category, address, area, lat, lng, facility_id) values
  ('bank-a', 'Bank A', 'government', 'x', 'Hebbal', 13.04, 77.59, '00000000-0000-0000-0000-0000000000a1');
insert into public.blood_stock (bank_id, blood_group, component, units) values ('bank-a', 'O+', 'prbc', 10);

-- =============================================================================
set local role authenticated;

-- ---------------------------------------------------------------- doctor B --
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}', true);

select p4t_check((select count(*) from patients where id = '00000000-0000-0000-0000-000000000101') = 0,
  'doctor B (other facility, no scan) cannot see patient 1');
select p4t_check((select count(*) from prescriptions) = 0, 'doctor B cannot read patient 1 prescriptions');
select p4t_check((select count(*) from consultations) = 0, 'doctor B cannot read patient 1 consultations');
select p4t_check((select count(*) from health_reports) = 0, 'doctor B cannot read patient 1 reports');
select p4t_check((select count(*) from access_logs) = 0, 'doctor B cannot read access logs');
select p4t_check((select count(*) from patient_consents) = 0, 'doctor B cannot read consents');
select p4t_check((select count(*) from patients where id = '00000000-0000-0000-0000-000000000102') = 1,
  'doctor B sees own-facility patient 2');

select p4t_denied($$insert into record_access_grants (patient_id, viewer_id, token_jti, expires_at)
  values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000021', 'forged', now() + interval '1 day')$$,
  'doctor B cannot grant themself access (QR scan is server-only)');
select p4t_denied($$insert into prescriptions (patient_id, prescribed_by)
  values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000021')$$,
  'doctor B cannot prescribe for a patient they cannot see');
select p4t_denied($$insert into access_logs (patient_id, viewer_id, viewer_role, method, outcome)
  values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000021', 'doctor', 'direct', 'granted')$$,
  'clients cannot write access logs');
select p4t_denied($$select * from qr_token_redemptions$$, 'clients cannot read QR redemptions');
select p4t_check(p4t_rows($$update patients set full_name = 'x' where id = '00000000-0000-0000-0000-000000000101'$$) = 0,
  'doctor B cannot edit patient 1');
select p4t_check(p4t_rows($$update patient_consents set share_history = true$$) = 0,
  'doctor B cannot flip a patient''s consent');

-- --------------------------------------------------- doctor A (same facility)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select p4t_check((select count(*) from patients where id = '00000000-0000-0000-0000-000000000101') = 1,
  'doctor A sees own-facility patient 1');
select p4t_check((select count(*) from health_reports) = 1, 'doctor A sees patient 1 reports');
select p4t_check((select count(*) from patients where id = '00000000-0000-0000-0000-000000000102') = 0,
  'doctor A cannot see facility-B patient 2');
select p4t_denied($$insert into prescriptions (patient_id, prescribed_by)
  values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000022')$$,
  'doctor A cannot write a prescription in another doctor''s name');
select p4t_denied($$insert into patients (id, user_id, full_name, facility_id)
  values ('00000000-0000-0000-0000-000000000199', null, 'Moved', '00000000-0000-0000-0000-0000000000b1')$$,
  'doctor A cannot register a patient at facility B');
select p4t_denied($$update patients set asha_worker_id = '00000000-0000-0000-0000-000000000042'
  where id = '00000000-0000-0000-0000-000000000101'$$,
  'doctor A cannot assign a facility-B ASHA worker');
select p4t_check((select count(*) from access_logs) = 0, 'doctor A cannot read access logs either');

-- ------------------------------------------------------- deactivated doctor
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000012","role":"authenticated"}', true);
select p4t_check((select count(*) from patients) = 0, 'deactivated doctor sees no patients');
select p4t_check((select count(*) from health_reports) = 0, 'deactivated doctor sees no reports');

-- ------------------------------------------------------------- patient two --
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select p4t_check((select count(*) from patients where id = '00000000-0000-0000-0000-000000000101') = 0,
  'patient 2 cannot see patient 1');
select p4t_check((select count(*) from health_reports) = 0, 'patient 2 cannot see patient 1 reports');
select p4t_check((select count(*) from access_logs) = 0, 'patient 2 cannot see patient 1 access log');
select p4t_check((select count(*) from patient_consents) = 1, 'patient 2 sees only their own consent row');
select p4t_denied($$insert into health_reports (patient_id, uploaded_by, category, title, storage_path, mime_type, size_bytes)
  values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000002', 'xray', 'x',
          '00000000-0000-0000-0000-000000000101/x.png', 'image/png', 10)$$,
  'patient 2 cannot upload into patient 1''s record');
select p4t_denied($$insert into prescriptions (patient_id, prescribed_by)
  values ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000002')$$,
  'patients cannot write doctor prescriptions');

-- ------------------------------------------------------------- patient one --
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select p4t_check((select count(*) from access_logs) = 1, 'patient 1 sees who viewed their record');
select p4t_check((select count(*) from health_reports) = 1, 'patient 1 sees own reports');

-- ------------------------------------------------------------------ admin B --
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000032","role":"authenticated"}', true);
select p4t_check((select count(*) from patients where id = '00000000-0000-0000-0000-000000000101') = 0,
  'admin B cannot see facility-A patient');
select p4t_check((select count(*) from access_logs) = 0, 'admin B cannot see facility-A access logs');
select p4t_check(p4t_rows($$update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000011'$$) = 0,
  'admin B cannot deactivate facility-A doctor');
select p4t_check(p4t_rows($$update blood_stock set units = 0 where bank_id = 'bank-a'$$) = 0,
  'admin B cannot edit facility-A blood stock');
select p4t_check((select count(*) from blood_stock where bank_id = 'bank-a') = 1, 'any user can read blood stock');

-- ------------------------------------------------------------------ admin A --
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}', true);
select p4t_check((select count(*) from access_logs) = 1, 'admin A sees facility-A access logs');
select p4t_check(p4t_rows($$update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000041'$$) = 1,
  'admin A can deactivate their ASHA worker');
select p4t_denied($$update profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000011'$$,
  'admin A cannot promote a doctor to admin');
select p4t_check(p4t_rows($$update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000031'$$) = 0,
  'admin A cannot edit their own admin profile');
select p4t_check(p4t_rows($$update blood_stock set units = 25 where bank_id = 'bank-a'$$) = 1,
  'admin A can edit own-facility blood stock');
select p4t_check((select updated_by from blood_stock where bank_id = 'bank-a') = '00000000-0000-0000-0000-000000000031',
  'stock edit is stamped with the editor');
select p4t_denied($$select * from qr_token_redemptions$$, 'admins cannot read QR redemptions');

-- =============================================================================
-- QR flow: server (owner) records a scan grant for doctor B on patient 1.
reset role;
insert into public.record_access_grants (patient_id, viewer_id, token_jti, expires_at) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000021', 'jti-2', now() + interval '12 hours'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000011', 'jti-3', now() + interval '12 hours');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}', true);
select p4t_check((select count(*) from patients where id = '00000000-0000-0000-0000-000000000101') = 1,
  'after QR scan with consent, doctor B sees patient 1');
select p4t_check((select count(*) from health_reports) = 1, 'after QR scan, doctor B sees patient 1 reports');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}', true);
select p4t_check((select count(*) from patients where id = '00000000-0000-0000-0000-000000000101') = 0,
  'a grant is personal: doctor B2 (same facility as B) still cannot see patient 1');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select p4t_check((select count(*) from patients where id = '00000000-0000-0000-0000-000000000102') = 0,
  'a grant without consent (patient 2 sharing off) gives doctor A nothing');

-- Patient 1 turns sharing off → doctor B loses access immediately.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select p4t_check(p4t_rows($$update patient_consents set share_history = false
  where patient_id = '00000000-0000-0000-0000-000000000101'$$) = 1, 'patient 1 turns sharing off');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000021","role":"authenticated"}', true);
select p4t_check((select count(*) from patients where id = '00000000-0000-0000-0000-000000000101') = 0,
  'after consent off, doctor B can no longer see patient 1');
select p4t_check((select count(*) from record_access_grants where revoked_at is null) = 0,
  'turning consent off revoked doctor B''s grant');

-- =============================================================================
-- Referral: ASHA refers patient 1 to facility B → facility-B doctors see them until closed.
reset role;
insert into public.referrals (id, patient_id, from_asha_id, to_doctor_id, to_facility_id, reason, status) values
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000101',
   '00000000-0000-0000-0000-000000000041', null, '00000000-0000-0000-0000-0000000000b1', 'BP 170/110', 'pending');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}', true);
select p4t_check((select count(*) from patients where id = '00000000-0000-0000-0000-000000000101') = 1,
  'referral to facility B lets doctor B2 see patient 1');
select p4t_check((select count(*) from referrals) = 1, 'doctor B2 sees the referral in the inbox');
select p4t_check(p4t_rows($$update referrals set status = 'accepted' where id = '00000000-0000-0000-0000-000000000901'$$) = 1,
  'doctor B2 can accept the referral');
select p4t_denied($$update referrals set status = 'pending' where id = '00000000-0000-0000-0000-000000000901'$$,
  'doctor B2 cannot move a referral back to pending');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select p4t_check((select count(*) from referrals) = 0, 'doctor A does not see a referral addressed to facility B');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000022","role":"authenticated"}', true);
select p4t_check(p4t_rows($$update referrals set status = 'closed' where id = '00000000-0000-0000-0000-000000000901'$$) = 1,
  'doctor B2 closes the referral');
select p4t_check((select count(*) from patients where id = '00000000-0000-0000-0000-000000000101') = 0,
  'closed referral no longer grants access');

reset role;
rollback;
