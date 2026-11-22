do $$
declare t text;
begin
 foreach t in array array['bank_settings','admin_audit_logs'] loop
  if to_regclass('public.'||t) is not null then
   execute format('drop trigger if exists activity_audit_capture on public.%I',t);
   execute format('create trigger activity_audit_capture after insert or update or delete on public.%I for each row execute function private.capture_activity_audit_event()',t);
  end if;
 end loop;
end $$;
