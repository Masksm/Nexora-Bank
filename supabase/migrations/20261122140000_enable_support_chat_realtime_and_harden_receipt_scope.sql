do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_messages') then
    alter publication supabase_realtime add table public.support_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_conversations') then
    alter publication supabase_realtime add table public.support_conversations;
  end if;
end $$;

drop policy if exists support_payment_receipts_customer_insert on public.support_payment_receipts;
create policy support_payment_receipts_customer_insert
on public.support_payment_receipts
for insert to authenticated
with check (
  customer_user_id = (select auth.uid())
  and exists (
    select 1 from public.support_payment_procedures p
    where p.id = support_payment_receipts.procedure_id
      and p.customer_user_id = (select auth.uid())
      and p.conversation_id = support_payment_receipts.conversation_id
      and p.status = 'awaiting_payment'
  )
  and exists (
    select 1 from public.support_conversations c
    where c.id = support_payment_receipts.conversation_id
      and c.user_id = (select auth.uid())
  )
);
