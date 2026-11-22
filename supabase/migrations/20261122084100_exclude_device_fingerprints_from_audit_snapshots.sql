create or replace function private.capture_activity_audit_event()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 v_old jsonb:=case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
 v_new jsonb:=case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
 v_row jsonb:=coalesce(v_new,v_old);
 v_actor uuid:=auth.uid(); v_subject uuid;
 v_actor_email text:=auth.jwt()->>'email'; v_subject_email text;
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
   v_details:=v_details||jsonb_build_object('record',v_row-'password'-'token'-'secret'-'recovery_phrase'-'private_key'-'storage_path'-'document_path'-'fingerprint'-'device_fingerprint');
 end if;
 insert into public.activity_audit_events(actor_user_id,actor_email,actor_role,subject_user_id,subject_email,event_source,event_name,entity_table,entity_id,request_path,details)
 values(v_actor,v_actor_email,v_role,v_subject,v_subject_email,'database',tg_table_name||'.'||lower(tg_op),tg_table_name,v_id,current_setting('request.path',true),v_details);
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
