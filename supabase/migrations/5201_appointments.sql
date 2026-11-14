-- =============================================================================
-- 5201  PHC appointments: doctor availability and booked appointments
-- =============================================================================
-- Slots are never stored. The server (server/appointments/slots.ts) computes
-- them from doctor_availability minus active appointments, in Asia/Kolkata.
-- With no availability rows a facility has no slots: the app says so instead
-- of showing invented times.
--
--   doctor_availability  weekly hours (weekday 0 = Sunday … 6 = Saturday) or a
--                        date exception (specific_date; is_closed = day off)
--   appointments         one row per booking; a reschedule is a new row with
--                        rescheduled_from = the old row, which is cancelled
--
-- Double booking: a partial unique index on (doctor_id, starts_at) for active
-- rows ('booked', 'confirmed'), so two concurrent inserts for the same slot
-- cannot both succeed. The server maps the conflict to "slot taken".
--
-- RLS (permissive, OR-combined, names start with a5_):
--   patient  reads own appointments; books / cancels own (status 'booked' / 'cancelled')
--   asha     reads and books / cancels for patients assigned to them
--   doctor   reads and updates appointments at their facility; edits own availability
--   admin    reads and updates appointments at their facility; edits availability
--            of doctors at their facility
--   anyone signed in reads availability (it is the PHC's published timetable)
-- The server uses the service-role key and applies the same rules itself
-- (server/appointments/service.ts). Re-runnable.
-- Requires 1000_base.sql (profiles, patients, facilities, p1_* helpers).
-- =============================================================================

-- The PHC's phone number, shown on "no times published yet: call the PHC". Null = unknown (no number shown).
alter table public.facilities add column if not exists phone text;

-- ------------------------------------------------------- doctor availability
create table if not exists public.doctor_availability (
  id            uuid primary key default gen_random_uuid(),
  doctor_id     uuid not null references public.profiles(id) on delete cascade,
  facility_id   uuid not null references public.facilities(id),
  weekday       smallint check (weekday between 0 and 6),
  specific_date date,
  is_closed     boolean not null default false,
  start_time    time,
  end_time      time,
  slot_minutes  integer not null default 15 check (slot_minutes between 5 and 240),
  valid_from    date,
  valid_to      date,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- exactly one of weekday / specific_date
  constraint doctor_availability_kind check ((weekday is null) <> (specific_date is null)),
  -- open hours need a window; only a date exception can close a day
  constraint doctor_availability_window check (
    (is_closed and specific_date is not null)
    or (not is_closed and start_time is not null and end_time is not null and start_time < end_time)
  ),
  constraint doctor_availability_validity check (valid_from is null or valid_to is null or valid_from <= valid_to)
);
create index if not exists doctor_availability_doctor on public.doctor_availability (doctor_id);
create index if not exists doctor_availability_facility on public.doctor_availability (facility_id);

-- --------------------------------------------------------------- appointments
create table if not exists public.appointments (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients(id) on delete cascade,
  doctor_id        uuid not null references public.profiles(id),
  facility_id      uuid not null references public.facilities(id),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           text not null default 'booked' check (status in ('booked', 'confirmed', 'cancelled', 'completed', 'no_show')),
  reason           text check (reason is null or length(reason) <= 500),
  booked_by        uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  cancelled_reason text check (cancelled_reason is null or length(cancelled_reason) <= 300),
  rescheduled_from uuid references public.appointments(id) on delete set null,
  constraint appointments_window check (starts_at < ends_at)
);
-- One active booking per doctor per start time.
create unique index if not exists appointments_doctor_slot_active
  on public.appointments (doctor_id, starts_at) where status in ('booked', 'confirmed');
create index if not exists appointments_patient on public.appointments (patient_id, starts_at desc);
create index if not exists appointments_facility_day on public.appointments (facility_id, starts_at);

-- updated_at bookkeeping (plain "now" on every change)
create or replace function public.a5_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end
$$;
drop trigger if exists a5_appointments_touch on public.appointments;
create trigger a5_appointments_touch before update on public.appointments for each row execute function public.a5_touch_updated_at();
drop trigger if exists a5_availability_touch on public.doctor_availability;
create trigger a5_availability_touch before update on public.doctor_availability for each row execute function public.a5_touch_updated_at();

-- ------------------------------------------------------------------- helpers
-- A doctor (active) registered at the signed-in admin's or doctor's facility.
create or replace function public.a5_is_doctor_of_my_facility(p_doctor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles d
    join public.profiles me on me.id = auth.uid() and me.is_active
    where d.id = p_doctor and d.role = 'doctor' and d.is_active
      and d.facility_id is not null and d.facility_id = me.facility_id
  )
$$;

-- An active doctor registered at this facility (an appointment can only be with such a doctor).
create or replace function public.a5_is_doctor_at_facility(p_doctor uuid, p_facility uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles d
    where d.id = p_doctor and d.role = 'doctor' and d.is_active and d.facility_id = p_facility
  )
$$;

-- -------------------------------------------------------- row-level security
alter table public.doctor_availability enable row level security;
alter table public.appointments        enable row level security;

-- availability: readable by every signed-in user (published timetable)
drop policy if exists a5_availability_select on public.doctor_availability;
create policy a5_availability_select on public.doctor_availability for select to authenticated using (true);

-- a doctor edits their own hours at their own facility; an admin edits hours of doctors at their facility
drop policy if exists a5_availability_write on public.doctor_availability;
create policy a5_availability_write on public.doctor_availability for all to authenticated
  using (
    (public.p1_my_role() = 'doctor' and doctor_id = auth.uid())
    or (public.p1_my_role() = 'admin' and facility_id = public.p1_my_facility())
  )
  with check (
    facility_id = public.p1_my_facility()
    and (
      (public.p1_my_role() = 'doctor' and doctor_id = auth.uid())
      or (public.p1_my_role() = 'admin' and public.a5_is_doctor_of_my_facility(doctor_id))
    )
  );

-- appointments: read
drop policy if exists a5_appointments_patient_select on public.appointments;
create policy a5_appointments_patient_select on public.appointments for select to authenticated
  using (public.p1_is_own_patient(patient_id));
drop policy if exists a5_appointments_asha_select on public.appointments;
create policy a5_appointments_asha_select on public.appointments for select to authenticated
  using (public.p1_is_my_asha_patient(patient_id));
drop policy if exists a5_appointments_staff_select on public.appointments;
create policy a5_appointments_staff_select on public.appointments for select to authenticated
  using (public.p1_my_role() in ('doctor', 'admin') and facility_id = public.p1_my_facility());

-- appointments: book (always as 'booked', in the booker's own name)
drop policy if exists a5_appointments_insert on public.appointments;
create policy a5_appointments_insert on public.appointments for insert to authenticated
  with check (
    status = 'booked'
    and booked_by = auth.uid()
    and public.a5_is_doctor_at_facility(doctor_id, facility_id)
    and (
      public.p1_is_own_patient(patient_id)
      or public.p1_is_my_asha_patient(patient_id)
      or (public.p1_my_role() in ('doctor', 'admin') and facility_id = public.p1_my_facility())
    )
  );

-- appointments: the patient or their ASHA can only cancel; staff of the facility can change status
drop policy if exists a5_appointments_patient_update on public.appointments;
create policy a5_appointments_patient_update on public.appointments for update to authenticated
  using ((public.p1_is_own_patient(patient_id) or public.p1_is_my_asha_patient(patient_id)) and status in ('booked', 'confirmed'))
  with check ((public.p1_is_own_patient(patient_id) or public.p1_is_my_asha_patient(patient_id)) and status = 'cancelled');
drop policy if exists a5_appointments_staff_update on public.appointments;
create policy a5_appointments_staff_update on public.appointments for update to authenticated
  using (public.p1_my_role() in ('doctor', 'admin') and facility_id = public.p1_my_facility())
  with check (public.p1_my_role() in ('doctor', 'admin') and facility_id = public.p1_my_facility());

-- nobody deletes appointments from a client (history is kept)
revoke delete on public.appointments from anon, authenticated;
revoke all on public.doctor_availability, public.appointments from anon;
