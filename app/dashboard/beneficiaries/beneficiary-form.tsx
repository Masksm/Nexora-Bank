"use client";

import { useMemo, useState } from "react";
import { addBeneficiary } from "./actions";
import { searchBanks } from "@/lib/bank-directory";

const countries = [
  { code:"US", name:"United States", format:"US routing number (ABA) + account number" },
  { code:"GB", name:"United Kingdom", format:"UK sort code + account number" },
  { code:"DE", name:"Germany", format:"IBAN" },
  { code:"FR", name:"France", format:"IBAN" },
  { code:"NL", name:"Netherlands", format:"IBAN" },
  { code:"ES", name:"Spain", format:"IBAN" },
  { code:"IE", name:"Ireland", format:"IBAN" },
  { code:"NX", name:"Nexora Bank", format:"10-digit Nexora account number" },
];

export default function BeneficiaryForm(){
  const [country,setCountry]=useState("US");
  const [bankName,setBankName]=useState("");
  const [bankFocused,setBankFocused]=useState(false);
  const selected=countries.find(item=>item.code===country)!;
  const isIban=["DE","FR","NL","ES","IE"].includes(country);
  const suggestions=useMemo(()=>searchBanks(country,bankName),[country,bankName]);
  function changeCountry(value:string){
    setCountry(value);
    setBankName(value==="NX"?"Nexora Bank":"");
  }
  return <form action={addBeneficiary} className="transfer-form">
    <label>Destination country
      <select name="country_code" value={country} onChange={event=>changeCountry(event.target.value)} required>
        {countries.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
      </select>
    </label>
    <p className="form-hint">{selected.format}</p>
    <label>Recipient account-holder name<input name="name" minLength={2} maxLength={100} required placeholder="Full name on the bank account"/></label>
    <label className="bank-autocomplete-label">Bank name
      <input name="bank_name" value={bankName} onChange={event=>setBankName(event.target.value)} onFocus={()=>setBankFocused(true)} onBlur={()=>setTimeout(()=>setBankFocused(false),120)} minLength={2} maxLength={120} required autoComplete="off" placeholder="Search banks or enter a bank name"/>
      {bankFocused && suggestions.length>0 && <div className="bank-autocomplete-list" role="listbox" aria-label="Matching banks">
        {suggestions.map(bank=><button type="button" role="option" aria-selected={bankName===bank.name} key={bank.country+bank.name} onMouseDown={event=>event.preventDefault()} onClick={()=>{setBankName(bank.name);setBankFocused(false);}}>{bank.name}</button>)}
      </div>}
      <span className="form-hint">Suggestions are a reference list, not confirmation that a bank or account is reachable.</span>
    </label>
    {country==="US" && <>
      <label>Routing number<input name="routing_number" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} required placeholder="9-digit ABA routing number"/></label>
      <label>Account number<input name="account_number" inputMode="numeric" pattern="[0-9]{4,17}" maxLength={17} required placeholder="Bank account number"/></label>
    </>}
    {country==="GB" && <>
      <label>Sort code<input name="sort_code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="6 digits, without spaces"/></label>
      <label>Account number<input name="account_number" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required placeholder="8-digit account number"/></label>
    </>}
    {isIban && <>
      <label>IBAN<input name="iban" autoCapitalize="characters" minLength={15} maxLength={34} required placeholder="Enter IBAN"/></label>
      <label>BIC / SWIFT (optional)<input name="bic" autoCapitalize="characters" maxLength={11} placeholder="Bank identifier code"/></label>
    </>}
    {country==="NX" && <label>Nexora account number<input name="account_number" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} required placeholder="10-digit account number"/></label>}
    <label>Nickname (optional)<input name="nickname" maxLength={60} placeholder="e.g. Rent"/></label>
    <div className="workspace-alert">The recipient name is customer-entered and has not been independently confirmed by the destination bank. Saving a recipient does not verify account ownership or initiate a payment.</div>
    <button type="submit">Save beneficiary</button>
  </form>;
}
