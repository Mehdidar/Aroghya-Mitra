-- =============================================================================
-- 4001  P4 — Doctor/Admin + Health Records: P4-owned tables and access helpers
-- =============================================================================
-- Depends on P1's base migration, which must create (column names as listed in
-- features/records/P1_SHARED_TYPES_REQUEST.md):
--   public.facilities(id)
--   public.profiles(id → auth.users, role, full_name, facility_id, is_active)
--   public.patients(id, user_id → auth.users, facility_id, asha_worker_id, ...)
--   public.referrals(id, patient_id, from_asha_id, to_doctor_id, to_facility_id, status, ...)
--
-- Access model (mirrors server/records/access.ts — keep in step):
--   patient → own record only
--   doctor  → patients at their facility, patients referred to them or their
--             facility (referral not closed), patients whose QR they scanned
--             while "Share history" was on (grant valid AND consent still on)
--   admin   → patients and staff at their facility
--   deactivated profile → nothing
-- AccessGrants and AccessLogs are written by the server (service role) only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER: they read tables the caller may not see, and so
-- avoid recursive RLS. search_path pinned to '' against hijacking.)
-- ---------------------------------------------------------------------------

create or replace function public.p4_my_role()
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.p4_my_facility()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.facility_id from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.p4_is_my_patient_record(p_patient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.patients pt
    join public.profiles me on me.id = auth.uid() and me.is_active and me.role = 'patient'
    where pt.id = p_patient and pt.user_id = me.id
  )
$$;

create or replace function public.p4_try_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when invalid_text_representation then
  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- Consent: the patient's "Share history" toggle
-- ---------------------------------------------------------------------------

create table if not exists public.patient_consents (
  patient_id    uuid primary key references public.patients(id) on delete cascade,
  share_history boolean not null default false,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Access granted by scanning the patient's QR (inserted by the server only)
-- ---------------------------------------------------------------------------

create table if not exists public.record_access_grants (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  viewer_id   uuid not null references public.profiles(id) on delete cascade,
  granted_via text not null default 'qr_scan' check (granted_via in ('qr_scan')),
  token_jti   text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  constraint record_access_grants_expiry check (expires_at > created_at)
);
create index if not exists record_access_grants_lookup
  on public.record_access_grants (patient_id, viewer_id) where revoked_at is null;

-- One row per redeemed QR token id: a token opened by one doctor cannot be
-- replayed by another.
create table if not exists public.qr_token_redemptions (
  jti         text primary key,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  viewer_id   uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Central access check, used by every P4 policy
-- ---------------------------------------------------------------------------

create or replace function public.p4_can_view_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles me
    join public.patients pt on pt.id = p_patient
    where me.id = auth.uid()
      and me.is_active
      and (
        (me.role = 'patient' and pt.user_id = me.id)
        or (me.role in ('doctor', 'admin')
            and pt.facility_id is not null
            and pt.facility_id = me.facility_id)
        or (me.role = 'doctor' and exists (
              select 1 from public.referrals r
              where r.patient_id = pt.id
                and r.status <> 'closed'
                and (r.to_doctor_id = me.id
                     or (me.facility_id is not null and r.to_facility_id = me.facility_id))))
        or (me.role = 'doctor' and exists (
              select 1
              from public.record_access_grants g
              join public.patient_consents c on c.patient_id = g.patient_id
              where g.patient_id = pt.id
                and g.viewer_id = me.id
                and g.revoked_at is null
                and g.expires_at > now()
                and c.share_history))
      )
  )
$$;

-- Turning "Share history" off revokes every QR grant at once.
create or replace function public.p4_on_consent_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if not new.share_history and (tg_op = 'INSERT' or old.share_history) then
    update public.record_access_grants
       set revoked_at = now()
     where patient_id = new.patient_id and revoked_at is null;
  end if;
  return new;
end
$$;

drop trigger if exists p4_consent_change on public.patient_consents;
create trigger p4_consent_change
  before insert or update on public.patient_consents
  for each row execute function public.p4_on_consent_change();

-- ---------------------------------------------------------------------------
-- Health reports (files live in the private `health-reports` bucket, 4003)
-- ---------------------------------------------------------------------------

create table if not exists public.health_reports (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete cascade,
  uploaded_by  uuid not null references public.profiles(id),
  category     text not null check (category in ('blood_test', 'cardiology', 'prescription', 'imaging', 'xray')),
  title        text not null check (length(title) between 1 and 200),
  storage_path text not null unique,
  mime_type    text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp')),
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  report_date  date,
  created_at   timestamptz not null default now(),
  -- The file must sit under the patient's own folder: <patient_id>/<file>.
  constraint health_reports_path_matches_patient check (split_part(storage_path, '/', 1) = patient_id::text)
);
create index if not exists health_reports_patient on public.health_reports (patient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Blood banks and stock
-- ---------------------------------------------------------------------------

create table if not exists public.blood_banks (
  id             text primary key,
  name           text not null,
  category       text not null check (category in ('government', 'charitable', 'private', 'red_cross')),
  address        text not null,
  area           text not null,
  city           text not null default 'Bengaluru',
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  phone          text,
  phone_verified boolean not null default false,
  open_24x7      boolean not null default false,
  facility_id    uuid references public.facilities(id),
  source         text not null default 'mock' check (source in ('mock', 'eraktkosh', 'manual')),
  is_active      boolean not null default true
);

create table if not exists public.blood_stock (
  bank_id     text not null references public.blood_banks(id) on delete cascade,
  blood_group text not null check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  component   text not null check (component in ('whole_blood', 'prbc', 'ffp', 'platelets_rdp', 'platelets_sdp', 'cryo')),
  units       integer not null check (units between 0 and 10000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id),
  primary key (bank_id, blood_group, component)
);

create or replace function public.p4_touch_blood_stock()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end
$$;

drop trigger if exists p4_blood_stock_touch on public.blood_stock;
create trigger p4_blood_stock_touch
  before insert or update on public.blood_stock
  for each row execute function public.p4_touch_blood_stock();

create or replace function public.p4_admins_bank(p_bank text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blood_banks b
    where b.id = p_bank and b.facility_id is not null
      and public.p4_my_role() = 'admin' and b.facility_id = public.p4_my_facility()
  )
$$;

-- ---------------------------------------------------------------------------
-- Row-level security on P4 tables
-- ---------------------------------------------------------------------------

alter table public.patient_consents     enable row level security;
alter table public.record_access_grants enable row level security;
alter table public.qr_token_redemptions enable row level security;
alter table public.health_reports       enable row level security;
alter table public.blood_banks          enable row level security;
alter table public.blood_stock          enable row level security;

-- Consent: only the patient reads or changes it.
create policy p4_consents_select on public.patient_consents for select to authenticated
  using (public.p4_is_my_patient_record(patient_id));
create policy p4_consents_insert on public.patient_consents for insert to authenticated
  with check (public.p4_is_my_patient_record(patient_id));
create policy p4_consents_update on public.patient_consents for update to authenticated
  using (public.p4_is_my_patient_record(patient_id))
  with check (public.p4_is_my_patient_record(patient_id));

-- Grants: the doctor holding one and the patient can see it; nobody writes from the client.
create policy p4_grants_select on public.record_access_grants for select to authenticated
  using (viewer_id = auth.uid() or public.p4_is_my_patient_record(patient_id));

-- Redemptions: server only (no policies → no client access).

-- Reports: whoever can view the patient can read; patient or a doctor with access can upload.
create policy p4_reports_select on public.health_reports for select to authenticated
  using (public.p4_can_view_patient(patient_id));
create policy p4_reports_insert on public.health_reports for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.p4_my_role() in ('patient', 'doctor')
    and public.p4_can_view_patient(patient_id)
  );
create policy p4_reports_delete on public.health_reports for delete to authenticated
  using (uploaded_by = auth.uid() and public.p4_can_view_patient(patient_id));

-- Blood banks: any signed-in user reads; the admin of the owning facility edits.
create policy p4_banks_select on public.blood_banks for select to authenticated using (is_active);
create policy p4_banks_update on public.blood_banks for update to authenticated
  using (public.p4_admins_bank(id)) with check (public.p4_admins_bank(id));

create policy p4_stock_select on public.blood_stock for select to authenticated using (true);
create policy p4_stock_insert on public.blood_stock for insert to authenticated
  with check (public.p4_admins_bank(bank_id));
create policy p4_stock_update on public.blood_stock for update to authenticated
  using (public.p4_admins_bank(bank_id)) with check (public.p4_admins_bank(bank_id));
create policy p4_stock_delete on public.blood_stock for delete to authenticated
  using (public.p4_admins_bank(bank_id));

-- Belt and braces: anonymous users get nothing, and server-only tables are closed to clients.
revoke all on public.patient_consents, public.record_access_grants, public.qr_token_redemptions,
              public.health_reports, public.blood_banks, public.blood_stock from anon;
revoke insert, update, delete on public.record_access_grants from authenticated;
revoke all on public.qr_token_redemptions from authenticated;
