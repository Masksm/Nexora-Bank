create or replace function private.announce_support_payment_receipt()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.support_messages(conversation_id,sender_user_id,sender_role,body)
 values(new.conversation_id,null,'system',
 'PAYMENT RECEIPT RECEIVED'||E'\n\n'||
 'Your receipt ('||new.original_filename||') has been securely received and attached to the payment audit record.'||E'\n'||
 'A staff administrator will review the submitted evidence.'||E'\n\n'||
 'Uploading a receipt does not by itself confirm that a blockchain payment has settled. Final payment confirmation requires independent verification on the selected network.');
 return new;
end $$;
create trigger support_payment_receipt_bot_reply after insert on public.support_payment_receipts
for each row execute function private.announce_support_payment_receipt();
revoke all on function private.announce_support_payment_receipt() from public,anon,authenticated;
