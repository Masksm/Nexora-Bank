create table if not exists public.activity_audit_events (
 id uuid primary key default gen_random_uuid(),
 actor_user_id uuid references auth.users(id) on delete set null,
 actor_email text, actor_role text not null default 'system',
 subject_user_id uuid references auth.users(id) on delete set null,
 subject_email text, event_source text not null default 'database',
 event_name text not null, entity_table text not null, entity_id text,
 request_path text, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists activity_audit_actor_created_idx on public.activity_audit_events(actor_user_id,created_at desc);
create index if not exists activity_audit_subject_created_idx on public.activity_audit_events(subject_user_id,created_at desc);
create index if not exists activity_audit_role_created_idx on public.activity_audit_events(actor_role,created_at desc);
create index if not exists activity_audit_entity_idx on public.activity_audit_events(entity_table,created_at desc);
alter table public.activity_audit_events enable row level security;
create policy activity_audit_super_admin_read on public.activity_audit_events for select to authenticated using (private.is_super_admin());
revoke all on public.activity_audit_events from anon,authenticated;
grant select on public.activity_audit_events to authenticated;

create or replace function private.capture_activity_audit_event()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 v_old jsonb:=case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
 v_new jsonb:=case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
 v_row jsonb:=coalesce(v_new,v_old);
 v_actor uuid:=auth.uid(); v_subject uuid;
 v_actor_email text:=auth.jwt()->>'email';
 v_subject_email text;
 v_role text:=coalesce(auth.jwt()->'app_metadata'->>'role','system');
 v_id text; v_details jsonb;
begin
 v_subject:=coalesce(nullif(v_row->>'user_id','')::uuid,nullif(v_row->>'customer_user_id','')::uuid,
   nullif(v_row->>'sender_user_id','')::uuid,nullif(v_row->>'admin_user_id','')::uuid);
 if v_subject is null and tg_table_name='support_messages' then
   select c.user_id into v_subject from public.support_conversations c where c.id=nullif(v_row->>'conversation_id','')::uuid;
 end if;
 if v_subject is null and tg_table_name='ledger_entries' then
   select ba.user_id into v_subject from public.bank_accounts ba where ba.id=nullif(v_row->>'account_id','')::uuid;
 end if;
 if v_subject is null and tg_table_name='ledger_transactions' then v_subject:=nullif(v_row->>'initiated_by','')::uuid; end if;
 if v_subject is not null then select u.email into v_subject_email from auth.users u where u.id=v_subject; end if;
 v_id:=coalesce(v_row->>'id',v_row->>'reference',v_row->>'account_number');
 v_details:=jsonb_build_object('operation',lower(tg_op));
 if tg_table_name='support_messages' then
   v_details:=v_details||jsonb_build_object('message_body',left(coalesce(v_row->>'body',''),4000),'sender_role',v_row->>'sender_role');
 elsif tg_table_name='support_conversations' then
   v_details:=v_details||jsonb_build_object('subject',v_row->>'subject','category',v_row->>'category','status',v_row->>'status');
 elsif tg_table_name='ledger_transactions' then
   v_details:=v_details||jsonb_build_object('reference',v_row->>'reference','transaction_type',v_row->>'transaction_type','status',v_row->>'status','description',v_row->>'description');
 elsif tg_table_name='admin_customer_assignments' then
   v_details:=v_details||jsonb_build_object('admin_user_id',v_row->>'admin_user_id','customer_user_id',v_row->>'customer_user_id');
 elsif tg_table_name='identity_documents' then
   v_details:=v_details||jsonb_build_object('document_type',v_row->>'document_type','review_status',v_row->>'review_status','file_name',v_row->>'file_name');
 else
   v_details:=v_details||jsonb_build_object('record',v_row-'password'-'token'-'secret'-'recovery_phrase'-'private_key'-'storage_path'-'document_path'-'fingerprint');
 end if;
 insert into public.activity_audit_events(actor_user_id,actor_email,actor_role,subject_user_id,subject_email,event_source,event_name,entity_table,entity_id,request_path,details)
 values(v_actor,v_actor_email,v_role,v_subject,v_subject_email,'database',tg_table_name||'.'||lower(tg_op),tg_table_name,v_id,current_setting('request.path',true),v_details);
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function private.capture_activity_audit_event() from public,anon,authenticated;

do $$
declare t text;
begin
 foreach t in array array['profiles','bank_accounts','beneficiaries','virtual_cards','scheduled_transfers','savings_goals',
 'support_conversations','support_messages','notifications','identity_documents','customer_verifications','user_sessions',
 'trusted_devices','ledger_transactions','ledger_entries','admin_customer_assignments','identity_verification_attempts',
 'login_history','support_payment_procedures','support_payment_procedure_audit','bank_settings','admin_audit_logs'] loop
  if to_regclass('public.'||t) is not null then
   execute format('drop trigger if exists activity_audit_capture on public.%I',t);
   execute format('create trigger activity_audit_capture after insert or update or delete on public.%I for each row execute function private.capture_activity_audit_event()',t);
  end if;
 end loop;
end $$;

create table if not exists public.support_payment_receipts (
 id uuid primary key default gen_random_uuid(),
 procedure_id uuid not null references public.support_payment_procedures(id) on delete restrict,
 conversation_id uuid not null references public.support_conversations(id) on delete restrict,
 customer_user_id uuid not null references auth.users(id) on delete restrict,
 storage_path text not null unique, original_filename text not null,
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 file_size_bytes bigint not null check(file_size_bytes between 1 and 10485760),
 review_status text not null default 'pending_review' check(review_status in ('pending_review','reviewed','rejected')),
 submitted_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz, review_note text,
 unique(procedure_id,storage_path)
);
create index if not exists support_payment_receipts_procedure_idx on public.support_payment_receipts(procedure_id,submitted_at desc);
create index if not exists support_payment_receipts_customer_idx on public.support_payment_receipts(customer_user_id,submitted_at desc);
alter table public.support_payment_receipts enable row level security;
create policy support_payment_receipts_scoped_read on public.support_payment_receipts for select to authenticated
 using(customer_user_id=(select auth.uid()) or private.can_access_customer(customer_user_id));
create policy support_payment_receipts_customer_insert on public.support_payment_receipts for insert to authenticated
 with check(customer_user_id=(select auth.uid())
 and exists(select 1 from public.support_payment_procedures p where p.id=procedure_id and p.customer_user_id=(select auth.uid()) and p.conversation_id=conversation_id and p.status='awaiting_payment')
 and exists(select 1 from public.support_conversations c where c.id=conversation_id and c.user_id=(select auth.uid())));
revoke all on public.support_payment_receipts from anon,authenticated;
grant select,insert on public.support_payment_receipts to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-receipts','payment-receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
create policy payment_receipts_upload_own on storage.objects for insert to authenticated
 with check(bucket_id='payment-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy payment_receipts_read_scoped on storage.objects for select to authenticated
 using(bucket_id='payment-receipts' and ((storage.foldername(name))[1]=(select auth.uid())::text or private.can_access_customer(nullif((storage.foldername(name))[1],'')::uuid)));
create policy payment_receipts_delete_super_admin on storage.objects for delete to authenticated
 using(bucket_id='payment-receipts' and private.is_super_admin());

create or replace function private.review_support_payment_receipt(p_receipt_id uuid,p_decision text,p_note text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_receipt public.support_payment_receipts%rowtype;
begin
 if auth.uid() is null or not private.is_staff_admin() then raise exception 'Staff administrator access required.'; end if;
 if p_decision not in ('reviewed','rejected') or length(trim(coalesce(p_note,'')))<3 or length(trim(p_note))>500 then raise exception 'Choose a valid review decision and provide a note.'; end if;
 select * into v_receipt from public.support_payment_receipts where id=p_receipt_id for update;
 if not found then raise exception 'Receipt not found.'; end if;
 if not private.can_access_customer(v_receipt.customer_user_id) then raise exception 'You are not assigned to this customer.'; end if;
 if coalesce(auth.jwt()->'app_metadata'->>'role','')='admin' and not exists(select 1 from public.admin_customer_assignments a where a.admin_user_id=auth.uid() and a.customer_user_id=v_receipt.customer_user_id) then raise exception 'You are not assigned to this customer.'; end if;
 if v_receipt.review_status<>'pending_review' then raise exception 'This receipt has already been reviewed.'; end if;
 update public.support_payment_receipts set review_status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_note) where id=p_receipt_id;
 insert into public.support_messages(conversation_id,sender_user_id,sender_role,body)
 values(v_receipt.conversation_id,null,'system',(case when p_decision='reviewed' then 'RECEIPT REVIEWED' else 'RECEIPT REQUIRES A NEW SUBMISSION' end)||E'\n\n'||trim(p_note)||E'\n\n'||'This review does not independently confirm an on-chain payment. Payment confirmation requires verification of the transaction on the selected blockchain network.');
end $$;
create or replace function public.review_support_payment_receipt(p_receipt_id uuid,p_decision text,p_note text)
returns void language sql security invoker set search_path=''
as $$ select private.review_support_payment_receipt(p_receipt_id,p_decision,p_note); $$;
revoke all on function private.review_support_payment_receipt(uuid,text,text) from public,anon,authenticated;
revoke all on function public.review_support_payment_receipt(uuid,text,text) from public,anon;
grant execute on function private.review_support_payment_receipt(uuid,text,text) to authenticated;
grant execute on function public.review_support_payment_receipt(uuid,text,text) to authenticated;

create or replace function private.prevent_activity_audit_mutation()
returns trigger language plpgsql set search_path=''
as $$ begin raise exception 'Activity audit events are immutable.'; end $$;
create trigger activity_audit_immutable before update or delete on public.activity_audit_events for each row execute function private.prevent_activity_audit_mutation();
revoke all on function private.prevent_activity_audit_mutation() from public,anon,authenticated;
