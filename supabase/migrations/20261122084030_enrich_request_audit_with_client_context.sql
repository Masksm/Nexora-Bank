create or replace function private.record_activity_request(p_path text,p_method text,p_user_agent text,p_ip_address text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_role text:=coalesce(auth.jwt()->'app_metadata'->>'role','customer'); v_email text:=auth.jwt()->>'email';
begin
 if v_uid is null then return; end if;
 if p_path is null or length(p_path)>300 or left(p_path,1)<>'/' then raise exception 'Invalid request path.'; end if;
 if p_method not in ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS') then raise exception 'Invalid request method.'; end if;
 insert into public.activity_audit_events(actor_user_id,actor_email,actor_role,subject_user_id,subject_email,event_source,event_name,entity_table,entity_id,request_path,details)
 values(v_uid,v_email,v_role,case when v_role not in ('admin','super_admin') then v_uid else null end,
 case when v_role not in ('admin','super_admin') then v_email else null end,
 'middleware','http.request.'||lower(p_method),'http_request',null,p_path,
 jsonb_build_object('method',p_method,'user_agent',left(coalesce(p_user_agent,''),500),'ip_address',left(coalesce(p_ip_address,''),64)));
end $$;
create or replace function public.record_activity_request(p_path text,p_method text,p_user_agent text,p_ip_address text)
returns void language sql security invoker set search_path=''
as $$ select private.record_activity_request(p_path,p_method,p_user_agent,p_ip_address); $$;
revoke all on function private.record_activity_request(text,text,text,text) from public,anon,authenticated;
revoke all on function public.record_activity_request(text,text,text,text) from public,anon;
grant execute on function private.record_activity_request(text,text,text,text) to authenticated;
grant execute on function public.record_activity_request(text,text,text,text) to authenticated;
