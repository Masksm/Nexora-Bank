alter table public.profiles
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists postal_code text,
  add column if not exists preferred_timezone text;

alter table public.profiles
  add constraint profiles_address_line1_length check (address_line1 is null or char_length(address_line1) <= 160),
  add constraint profiles_address_line2_length check (address_line2 is null or char_length(address_line2) <= 160),
  add constraint profiles_city_length check (city is null or char_length(city) <= 100),
  add constraint profiles_region_length check (region is null or char_length(region) <= 100),
  add constraint profiles_postal_code_length check (postal_code is null or char_length(postal_code) <= 24),
  add constraint profiles_timezone_length check (preferred_timezone is null or char_length(preferred_timezone) <= 80);

create table if not exists public.identity_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('passport','national_id','drivers_license')),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 180),
  content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png')),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  review_status text not null default 'submitted' check (review_status in ('submitted','under_review','verified','rejected')),
  uploaded_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(user_id, storage_path)
);

alter table public.identity_documents enable row level security;
revoke all on public.identity_documents from anon, public;
grant select, insert, delete on public.identity_documents to authenticated;

drop policy if exists identity_documents_select_own on public.identity_documents;
create policy identity_documents_select_own on public.identity_documents
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists identity_documents_insert_own on public.identity_documents;
create policy identity_documents_insert_own on public.identity_documents
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and review_status = 'submitted'
  and reviewed_at is null
);

drop policy if exists identity_documents_delete_own on public.identity_documents;
create policy identity_documents_delete_own on public.identity_documents
for delete to authenticated using ((select auth.uid()) = user_id and review_status = 'submitted');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('identity-documents', 'identity-documents', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf','image/jpeg','image/png'];

drop policy if exists identity_docs_read_own on storage.objects;
create policy identity_docs_read_own on storage.objects
for select to authenticated using (
  bucket_id = 'identity-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists identity_docs_upload_own on storage.objects;
create policy identity_docs_upload_own on storage.objects
for insert to authenticated with check (
  bucket_id = 'identity-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists identity_docs_delete_own on storage.objects;
create policy identity_docs_delete_own on storage.objects
for delete to authenticated using (
  bucket_id = 'identity-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
