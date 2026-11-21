"use client";

import { useState } from "react";
import { addBeneficiary } from "./actions";

const countries = [
  { code:"US", name:"United States", format:"US routing number + account number" },
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
  const selected=countries.find(item=>item.code===country)!;
  const isIban=["DE","FR","NL","ES","IE"].includes(country);
  return <form action={addBeneficiary} className="transfer-form">
    <label>Destination country
      <select name="country_code" value={country} onChange={event=>setCountry(event.target.value)} required>
        {countries.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
      </select>
    </label>
    <p className="form-hint">{selected.format}</p>
    <label>Recipient account-holder name<input name="name" minLength={2} maxLength={100} required placeholder="Full name on the bank account"/></label>
    <label>Bank name<input name="bank_name" minLength={2} maxLength={120} required placeholder="Enter the recipient's bank name"/></label>
    {country==="US" && <>
      <label>Routing number<input name="routing_number" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} required placeholder="9-digit routing number"/></label>
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
    <div className="workspace-alert">Account details are being saved but the account-holder name has not yet been independently verified. Do not treat it as confirmed.</div>
    <button type="submit">Save beneficiary</button>
  </form>;
}
