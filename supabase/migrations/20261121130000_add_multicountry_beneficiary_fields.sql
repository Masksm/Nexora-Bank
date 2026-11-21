-- Multi-country beneficiary details. Existing Nexora beneficiaries remain compatible.
alter table public.beneficiaries
  alter column account_number drop not null,
  add column if not exists country_code text not null default 'NX',
  add column if not exists routing_number text,
  add column if not exists sort_code text,
  add column if not exists iban text,
  add column if not exists bic text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verification_method text,
  add column if not exists verified_at timestamptz,
  add column if not exists provider_reference text;

alter table public.beneficiaries
  drop constraint if exists beneficiaries_country_code_check,
  drop constraint if exists beneficiaries_verification_status_check,
  drop constraint if exists beneficiaries_account_details_check;

alter table public.beneficiaries
  add constraint beneficiaries_country_code_check
    check (country_code in ('NX','US','GB','DE','FR','NL','ES','IE')),
  add constraint beneficiaries_verification_status_check
    check (verification_status in ('unverified','pending','verified','failed','unavailable')),
  add constraint beneficiaries_account_details_check
    check (
      (country_code = 'NX' and account_number ~ '^[0-9]{10}$')
      or (country_code = 'US' and routing_number ~ '^[0-9]{9}$' and account_number ~ '^[0-9]{4,17}$')
      or (country_code = 'GB' and sort_code ~ '^[0-9]{6}$' and account_number ~ '^[0-9]{8}$')
      or (country_code in ('DE','FR','NL','ES','IE') and iban ~ '^[A-Z]{2}[0-9A-Z]{13,32}$')
    );

create index if not exists beneficiaries_user_country_created_idx
  on public.beneficiaries(user_id,country_code,created_at desc);

comment on column public.beneficiaries.verification_status is
  'Account-holder verification state. unverified means the entered name has not been independently verified.';
