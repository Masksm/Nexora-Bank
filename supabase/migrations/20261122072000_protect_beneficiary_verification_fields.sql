revoke insert, update on public.beneficiaries from authenticated;
grant insert (
  user_id, beneficiary_name, account_number, bank_name, nickname,
  country_code, routing_number, sort_code, iban, bic
) on public.beneficiaries to authenticated;
grant update (
  beneficiary_name, account_number, bank_name, nickname,
  country_code, routing_number, sort_code, iban, bic
) on public.beneficiaries to authenticated;
