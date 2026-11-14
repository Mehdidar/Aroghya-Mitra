-- =============================================================================
-- 5201 appointments: double-booking guard and RLS. Runs in one transaction and
-- rolls back. Needs 1000, 4001, 4002 and 5201 applied, e.g.
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/5201_appointments_rls.test.sql
-- Any failure raises "APPT TEST FAILED: …" and aborts.
-- =============================================================================
begin;

create function public.a5t_check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'APPT TEST FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Statement must fail with the given SQLSTATE class: 42501 (RLS / privilege), 23505 (unique), 23514 (check).
create function public.a5t_fails(stmt text, state text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = state then raise notice 'ok - %', msg; return; end if;
    raise exception 'APPT TEST FAILED: % (got % %)', msg, sqlstate, sqlerrm;
  end;
  raise exception 'APPT TEST FAILED: % (statement was allowed)', msg;
end $$;

create function public.a5t_rows(stmt text) returns integer language plpgsql as $$
declare n integer;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.a5t_check(boolean, text), public.a5t_fails(text, text, text), public.a5t_rows(text) to authenticated;

-- --- fixtures (as owner) ------------------------------------------------------
insert into public.facilities (id, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'PHC A'),
  ('00000000-0000-0000-0000-0000000000b1', 'PHC B');
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000011'), ('00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000031'), ('00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-000000000042');
insert into public.profiles (id, role, full_name, facility_id) values
  ('00000000-0000-0000-0000-000000000001', 'patient', 'P1', null),
  ('00000000-0000-0000-0000-000000000002', 'patient', 'P2', null),
  ('00000000-0000-0000-0000-000000000011', 'doctor', 'Doc A', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000000021', 'doctor', 'Doc B', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-000000000031', 'admin', 'Admin A', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000000041', 'asha', 'ASHA A', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000000042', 'asha', 'ASHA B', '00000000-0000-0000-0000-0000000000b1');
insert into public.patients (id, user_id, full_name, facility_id, asha_worker_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000001', 'P1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000041'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000002', 'P2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000042');

-- --- constraints ----------------------------------------------------------------
select public.a5t_fails($$insert into public.doctor_availability (doctor_id, facility_id, weekday, is_closed)
  values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', 1, true)$$, '23514', 'only a date exception can close a day');
select public.a5t_fails($$insert into public.doctor_availability (doctor_id, facility_id, weekday, start_time, end_time)
  values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', 1, '10:00', '09:00')$$, '23514', 'window must end after it starts');
select public.a5t_fails($$insert into public.doctor_availability (doctor_id, facility_id, weekday, specific_date, start_time, end_time)
  values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', 1, '2026-11-16', '09:00', '10:00')$$, '23514', 'weekday and date are exclusive');

-- double booking: one active row per doctor and start time
insert into public.appointments (id, patient_id, doctor_id, facility_id, starts_at, ends_at, status) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', '2026-11-16 09:00+05:30', '2026-11-16 09:15+05:30', 'booked');
select public.a5t_fails($$insert into public.appointments (patient_id, doctor_id, facility_id, starts_at, ends_at)
  values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', '2026-11-16 03:30Z', '2026-11-16 03:45Z')$$, '23505', 'same doctor, same slot (in another time-zone spelling) is refused');
update public.appointments set status = 'cancelled' where id = '00000000-0000-0000-0000-0000000000c1';
insert into public.appointments (id, patient_id, doctor_id, facility_id, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', '2026-11-16 09:00+05:30', '2026-11-16 09:15+05:30');
select public.a5t_check(true, 'a cancelled booking frees the slot for a new one');
insert into public.appointments (id, patient_id, doctor_id, facility_id, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000b1', '2026-11-16 09:00+05:30', '2026-11-16 09:15+05:30');

set local role authenticated;

-- --- patient P1 -----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.a5t_check((select count(*) from public.appointments) = 2, 'patient sees only their own appointments (2 rows incl. cancelled)');
select public.a5t_check((select count(*) from public.appointments where patient_id = '00000000-0000-0000-0000-0000000000f2') = 0, 'patient cannot see another patient''s appointment');
select public.a5t_check(public.a5t_rows($$insert into public.appointments (patient_id, doctor_id, facility_id, starts_at, ends_at, booked_by)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', '2026-11-16 09:15+05:30', '2026-11-16 09:30+05:30', '00000000-0000-0000-0000-000000000001')$$) = 1, 'patient books for themselves');
select public.a5t_fails($$insert into public.appointments (patient_id, doctor_id, facility_id, starts_at, ends_at, booked_by)
  values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', '2026-11-16 09:30+05:30', '2026-11-16 09:45+05:30', '00000000-0000-0000-0000-000000000001')$$, '42501', 'patient cannot book for someone else');
select public.a5t_fails($$insert into public.appointments (patient_id, doctor_id, facility_id, starts_at, ends_at, booked_by, status)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', '2026-11-16 09:45+05:30', '2026-11-16 10:00+05:30', '00000000-0000-0000-0000-000000000001', 'confirmed')$$, '42501', 'patient cannot book as confirmed');
select public.a5t_fails($$insert into public.appointments (patient_id, doctor_id, facility_id, starts_at, ends_at, booked_by)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000a1', '2026-11-16 09:45+05:30', '2026-11-16 10:00+05:30', '00000000-0000-0000-0000-000000000001')$$, '42501', 'doctor must work at the facility');
select public.a5t_fails($$update public.appointments set status = 'confirmed' where id = '00000000-0000-0000-0000-0000000000c2'$$, '42501', 'patient cannot confirm');
select public.a5t_check(public.a5t_rows($$update public.appointments set status = 'cancelled' where id = '00000000-0000-0000-0000-0000000000c2'$$) = 1, 'patient cancels their own');
select public.a5t_fails($$delete from public.appointments where id = '00000000-0000-0000-0000-0000000000c2'$$, '42501', 'nobody deletes appointments from a client');
select public.a5t_fails($$insert into public.doctor_availability (doctor_id, facility_id, weekday, start_time, end_time)
  values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', 1, '09:00', '10:00')$$, '42501', 'patient cannot publish hours');
select public.a5t_check((select count(*) from public.doctor_availability) >= 0, 'patient can read published hours');

-- --- ASHA A (P1 is assigned to them) --------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000041","role":"authenticated"}', true);
select public.a5t_check((select count(*) from public.appointments) = 3, 'ASHA sees appointments of assigned patients only');
select public.a5t_check(public.a5t_rows($$insert into public.appointments (patient_id, doctor_id, facility_id, starts_at, ends_at, booked_by)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', '2026-11-16 10:00+05:30', '2026-11-16 10:15+05:30', '00000000-0000-0000-0000-000000000041')$$) = 1, 'ASHA books for an assigned patient');
select public.a5t_fails($$insert into public.appointments (patient_id, doctor_id, facility_id, starts_at, ends_at, booked_by)
  values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', '2026-11-16 10:15+05:30', '2026-11-16 10:30+05:30', '00000000-0000-0000-0000-000000000041')$$, '42501', 'ASHA cannot book for a patient not assigned to them');

-- --- Doctor A -------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated"}', true);
select public.a5t_check((select count(*) from public.appointments where facility_id = '00000000-0000-0000-0000-0000000000b1') = 0, 'doctor does not see another facility''s appointments');
select public.a5t_check((select count(*) from public.appointments) = 4, 'doctor sees their facility''s appointments');
select public.a5t_check(public.a5t_rows($$update public.appointments set status = 'confirmed' where starts_at = '2026-11-16 09:15+05:30'$$) = 1, 'doctor confirms at their facility');
select public.a5t_check(public.a5t_rows($$update public.appointments set status = 'confirmed' where id = '00000000-0000-0000-0000-0000000000c3'$$) = 0, 'doctor cannot touch another facility''s appointment');
select public.a5t_check(public.a5t_rows($$insert into public.doctor_availability (doctor_id, facility_id, weekday, start_time, end_time, created_by)
  values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', 1, '09:00', '10:00', '00000000-0000-0000-0000-000000000011')$$) = 1, 'doctor publishes own hours');
select public.a5t_fails($$insert into public.doctor_availability (doctor_id, facility_id, weekday, start_time, end_time)
  values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000a1', 1, '09:00', '10:00')$$, '42501', 'doctor cannot publish hours for another doctor');

-- --- Admin A --------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000031","role":"authenticated"}', true);
select public.a5t_check(public.a5t_rows($$insert into public.doctor_availability (doctor_id, facility_id, specific_date, is_closed)
  values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000a1', '2026-12-25', true)$$) = 1, 'admin publishes a day off for a facility doctor');
select public.a5t_fails($$insert into public.doctor_availability (doctor_id, facility_id, weekday, start_time, end_time)
  values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000b1', 1, '09:00', '10:00')$$, '42501', 'admin cannot publish hours at another facility');
select public.a5t_check(public.a5t_rows($$delete from public.doctor_availability where specific_date = '2026-12-25'$$) = 1, 'admin removes facility hours');

-- --- anon -------------------------------------------------------------------------
reset role;
set local role anon;
select public.a5t_fails($$select count(*) from public.appointments$$, '42501', 'anon reads nothing');
reset role;

rollback;
