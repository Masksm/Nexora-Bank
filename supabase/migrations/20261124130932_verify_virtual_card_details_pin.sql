create or replace function public.verify_virtual_card_details_pin(p_pin text)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $function$
declare
  v_valid boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'Enter your six-digit transaction PIN.';
  end if;
  v_valid := private.check_transaction_pin(auth.uid(), p_pin);
  return coalesce(v_valid, false);
end;
$function$;

revoke all on function public.verify_virtual_card_details_pin(text) from public;
revoke all on function public.verify_virtual_card_details_pin(text) from anon;
grant execute on function public.verify_virtual_card_details_pin(text) to authenticated;
