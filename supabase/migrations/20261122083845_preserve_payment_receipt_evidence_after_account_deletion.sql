alter table public.support_payment_receipts
  add column if not exists customer_email_snapshot text;
alter table public.support_payment_receipts alter column customer_user_id drop not null;
alter table public.support_payment_receipts alter column conversation_id drop not null;
alter table public.support_payment_receipts drop constraint if exists support_payment_receipts_customer_user_id_fkey;
alter table public.support_payment_receipts drop constraint if exists support_payment_receipts_conversation_id_fkey;
alter table public.support_payment_receipts
  add constraint support_payment_receipts_customer_user_id_fkey foreign key(customer_user_id) references auth.users(id) on delete set null,
  add constraint support_payment_receipts_conversation_id_fkey foreign key(conversation_id) references public.support_conversations(id) on delete set null;

create or replace function private.snapshot_support_payment_receipt_customer()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.customer_user_id is not null and new.customer_email_snapshot is null then
    select email into new.customer_email_snapshot from auth.users where id=new.customer_user_id;
  end if;
  return new;
end;
$$;
create trigger support_payment_receipt_customer_snapshot before insert on public.support_payment_receipts
for each row execute function private.snapshot_support_payment_receipt_customer();
revoke all on function private.snapshot_support_payment_receipt_customer() from public,anon,authenticated;
