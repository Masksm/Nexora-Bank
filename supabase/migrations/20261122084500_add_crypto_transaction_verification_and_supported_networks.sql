alter table public.support_payment_procedures
  add column if not exists verification_status text not null default 'not_submitted',
  add column if not exists transaction_hash text,
  add column if not exists verification_checked_at timestamptz,
  add column if not exists verification_confirmations integer,
  add column if not exists verification_result jsonb not null default '{}'::jsonb,
  add column if not exists verified_at timestamptz;

alter table public.support_payment_procedures
  drop constraint if exists support_payment_procedures_verification_status_check;
alter table public.support_payment_procedures
  add constraint support_payment_procedures_verification_status_check
  check (verification_status in ('not_submitted','pending','verified','not_found','mismatch','failed'));

create unique index if not exists support_payment_procedures_transaction_hash_unique
  on public.support_payment_procedures (lower(transaction_hash))
  where transaction_hash is not null;

create or replace function private.validate_supported_crypto_payment_address()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_asset text := upper(trim(new.cryptocurrency));
  v_network text := upper(trim(new.network));
  v_address text := trim(new.wallet_address);
begin
  if v_asset = 'USDT' and v_network = 'TRON (TRC20)' then
    if v_address !~ '^T[1-9A-HJ-NP-Za-km-z]{33}$' then
      raise exception 'For USDT on TRON (TRC20), enter a valid-format TRON address beginning with T (34 Base58 characters).';
    end if;
  elsif v_asset = 'BTC' and v_network = 'BITCOIN' then
    if v_address !~ '^(bc1[ac-hj-np-z02-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$' then
      raise exception 'For BTC on Bitcoin, enter a mainnet legacy, P2SH or bech32 address (1..., 3... or bc1...).';
    end if;
  else
    raise exception 'Unsupported cryptocurrency/network. Currently allowed: USDT on TRON (TRC20), or BTC on Bitcoin.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_supported_crypto_payment_address on public.support_payment_procedures;
create trigger validate_supported_crypto_payment_address
before insert or update of cryptocurrency, network, wallet_address
on public.support_payment_procedures
for each row execute function private.validate_supported_crypto_payment_address();

comment on column public.support_payment_procedures.verification_status is
  'Blockchain verification state. Verified results are written only by the verify-crypto-payment Edge Function.';
comment on column public.support_payment_procedures.transaction_hash is
  'Customer-submitted public blockchain transaction hash; unique to prevent duplicate payment credit.';
