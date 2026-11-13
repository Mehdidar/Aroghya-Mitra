-- =============================================================================
-- 4003  P4 — private storage bucket for uploaded health reports
-- =============================================================================
-- Object path: <patient_id>/<uuid>.<ext>. Access follows p4_can_view_patient().
-- Files are read through short-lived signed URLs, never public links.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'health-reports', 'health-reports', false, 20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy p4_report_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'health-reports'
    and public.p4_can_view_patient(public.p4_try_uuid((storage.foldername(name))[1]))
  );

create policy p4_report_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'health-reports'
    and public.p4_my_role() in ('patient', 'doctor')
    and public.p4_can_view_patient(public.p4_try_uuid((storage.foldername(name))[1]))
  );

create policy p4_report_files_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'health-reports'
    and owner_id = auth.uid()::text
    and public.p4_can_view_patient(public.p4_try_uuid((storage.foldername(name))[1]))
  );
