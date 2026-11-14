-- =============================================================================
-- 5301  ASHA connect: how patients get an ASHA, and how they talk to her
-- =============================================================================
--   asha_service_areas      villages / wards / pincodes each ASHA covers (admin edits)
--   asha_assignment_events  every change of a patient's ASHA: who, when, how, why
--   asha_connect_requests   a patient asked for an ASHA and no ASHA covers their village yet
--   asha_messages           patient <-> ASHA messages, visit requests and call-back requests
--
-- The patient's current ASHA stays in patients.asha_worker_id (1000_base.sql).
-- The server (server/ashaConnect) uses the service-role key and applies the
-- same rules itself; these policies are for direct (anon-key) access.
--
-- RLS (names start with p53_):
--   patient  reads own events / request / messages; writes own messages (sender_role 'patient')
--   asha     reads own areas, events of her patients; reads and writes messages of her caseload
--   doctor   reads areas and events of their facility (no messages: they are between patient and ASHA)
--   admin    reads and writes areas, events and requests of their facility
-- Re-runnable. Requires 1000_base.sql.
-- =============================================================================

create table if not exists public.asha_service_areas (
  asha_id     uuid not null references public.profiles(id) on delete cascade,
  facility_id uuid references public.facilities(id),
  area        text not null check (length(area) between 1 and 60),
  area_key    text not null,
  created_at  timestamptz not null default now(),
  primary key (asha_id, area_key)
);
create index if not exists asha_service_areas_key on public.asha_service_areas (area_key);

create table if not exists public.asha_assignment_events (
  id               uuid primary key,
  patient_id       uuid not null references public.patients(id) on delete cascade,
  asha_id          uuid references public.profiles(id),
  previous_asha_id uuid references public.profiles(id),
  method           text not null check (method in ('area_match', 'admin', 'qr_scan', 'unassigned')),
  reason           text check (reason is null or length(reason) <= 200),
  by_id            uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);
create index if not exists asha_assignment_events_patient on public.asha_assignment_events (patient_id, created_at);
create index if not exists asha_assignment_events_prev on public.asha_assignment_events (previous_asha_id, created_at);

create table if not exists public.asha_connect_requests (
  patient_id   uuid primary key references public.patients(id) on delete cascade,
  area         text not null check (length(area) between 1 and 60),
  requested_at timestamptz not null default now()
);

create table if not exists public.asha_messages (
  id                   uuid primary key,
  patient_id           uuid not null references public.patients(id) on delete cascade,
  asha_id              uuid references public.profiles(id),
  sender_role          text not null check (sender_role in ('patient', 'asha')),
  sender_id            uuid not null references public.profiles(id),
  kind                 text not null default 'text' check (kind in ('text', 'visit_request', 'call_request')),
  body                 text not null default '' check (length(body) <= 1000),
  visit_when           text check (visit_when is null or visit_when in ('today', 'tomorrow', 'this_week')),
  status               text check (status is null or status in ('open', 'accepted', 'done', 'declined')),
  scheduled_for        timestamptz,
  urgent               boolean not null default false,
  emergency_categories text[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  read_at              timestamptz,
  -- Requests carry a status; plain messages do not.
  constraint asha_messages_status_kind check ((kind = 'text') = (status is null))
);
create index if not exists asha_messages_patient on public.asha_messages (patient_id, created_at);
create index if not exists asha_messages_asha_open on public.asha_messages (asha_id, updated_at);

drop trigger if exists p53_asha_messages_touch on public.asha_messages;
create trigger p53_asha_messages_touch before update on public.asha_messages for each row execute function public.p1_touch_updated_at();

-- A request's status only moves forward: open -> accepted -> done; open/accepted -> declined. Never back.
create or replace function public.p53_request_status_forward()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status is distinct from new.status then
    if old.status in ('done', 'declined')
       or (old.status = 'accepted' and new.status = 'open') then
      raise exception 'asha_messages: request status cannot move from % to %', old.status, new.status;
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists p53_asha_messages_forward on public.asha_messages;
create trigger p53_asha_messages_forward before update on public.asha_messages for each row execute function public.p53_request_status_forward();

-- -------------------------------------------------------- row-level security
alter table public.asha_service_areas     enable row level security;
alter table public.asha_assignment_events enable row level security;
alter table public.asha_connect_requests  enable row level security;
alter table public.asha_messages          enable row level security;

-- areas: facility staff read; admin of the facility writes; an ASHA reads her own
drop policy if exists p53_areas_staff_select on public.asha_service_areas;
create policy p53_areas_staff_select on public.asha_service_areas for select to authenticated
  using (asha_id = auth.uid() or (public.p1_my_role() in ('doctor', 'admin', 'asha') and facility_id = public.p1_my_facility()));
drop policy if exists p53_areas_admin_all on public.asha_service_areas;
create policy p53_areas_admin_all on public.asha_service_areas for all to authenticated
  using (public.p1_my_role() = 'admin' and facility_id = public.p1_my_facility())
  with check (public.p1_my_role() = 'admin' and facility_id = public.p1_my_facility());

-- assignment events: patient own; ASHA for patients now or formerly hers; facility doctor/admin read; admin insert
drop policy if exists p53_events_patient_select on public.asha_assignment_events;
create policy p53_events_patient_select on public.asha_assignment_events for select to authenticated
  using (public.p1_is_own_patient(patient_id));
drop policy if exists p53_events_asha_select on public.asha_assignment_events;
create policy p53_events_asha_select on public.asha_assignment_events for select to authenticated
  using (asha_id = auth.uid() or previous_asha_id = auth.uid());
drop policy if exists p53_events_facility_select on public.asha_assignment_events;
create policy p53_events_facility_select on public.asha_assignment_events for select to authenticated
  using (public.p1_my_role() in ('doctor', 'admin') and exists (
    select 1 from public.patients pt where pt.id = asha_assignment_events.patient_id and pt.facility_id = public.p1_my_facility()));
drop policy if exists p53_events_admin_insert on public.asha_assignment_events;
create policy p53_events_admin_insert on public.asha_assignment_events for insert to authenticated
  with check (public.p1_my_role() = 'admin' and by_id = auth.uid());

-- connect requests: the patient creates / reads own; facility admin reads and clears
drop policy if exists p53_requests_patient_all on public.asha_connect_requests;
create policy p53_requests_patient_all on public.asha_connect_requests for all to authenticated
  using (public.p1_is_own_patient(patient_id)) with check (public.p1_is_own_patient(patient_id));
drop policy if exists p53_requests_admin_all on public.asha_connect_requests;
create policy p53_requests_admin_all on public.asha_connect_requests for all to authenticated
  using (public.p1_my_role() = 'admin' and exists (
    select 1 from public.patients pt where pt.id = asha_connect_requests.patient_id and (pt.facility_id is null or pt.facility_id = public.p1_my_facility())))
  with check (public.p1_my_role() = 'admin');

-- messages: between the patient and the ASHA of their caseload only
drop policy if exists p53_messages_patient_select on public.asha_messages;
create policy p53_messages_patient_select on public.asha_messages for select to authenticated
  using (public.p1_is_own_patient(patient_id));
drop policy if exists p53_messages_patient_insert on public.asha_messages;
create policy p53_messages_patient_insert on public.asha_messages for insert to authenticated
  with check (public.p1_is_own_patient(patient_id) and sender_role = 'patient' and sender_id = auth.uid() and scheduled_for is null);
drop policy if exists p53_messages_asha_select on public.asha_messages;
create policy p53_messages_asha_select on public.asha_messages for select to authenticated
  using (public.p1_is_my_asha_patient(patient_id));
drop policy if exists p53_messages_asha_insert on public.asha_messages;
create policy p53_messages_asha_insert on public.asha_messages for insert to authenticated
  with check (public.p1_is_my_asha_patient(patient_id) and sender_role = 'asha' and sender_id = auth.uid() and kind = 'text');
drop policy if exists p53_messages_asha_update on public.asha_messages;
create policy p53_messages_asha_update on public.asha_messages for update to authenticated
  using (public.p1_is_my_asha_patient(patient_id)) with check (public.p1_is_my_asha_patient(patient_id));

revoke all on public.asha_service_areas, public.asha_assignment_events, public.asha_connect_requests, public.asha_messages from anon;
