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
  { code:"AT", name:"Austria", format:"IBAN" },
  { code:"BE", name:"Belgium", format:"IBAN" },
  { code:"BG", name:"Bulgaria", format:"IBAN" },
  { code:"CH", name:"Switzerland", format:"IBAN" },
  { code:"CY", name:"Cyprus", format:"IBAN" },
  { code:"CZ", name:"Czechia", format:"IBAN" },
  { code:"DK", name:"Denmark", format:"IBAN" },
  { code:"EE", name:"Estonia", format:"IBAN" },
  { code:"FI", name:"Finland", format:"IBAN" },
  { code:"GR", name:"Greece", format:"IBAN" },
  { code:"HR", name:"Croatia", format:"IBAN" },
  { code:"HU", name:"Hungary", format:"IBAN" },
  { code:"IS", name:"Iceland", format:"IBAN" },
  { code:"IT", name:"Italy", format:"IBAN" },
  { code:"LI", name:"Liechtenstein", format:"IBAN" },
  { code:"LT", name:"Lithuania", format:"IBAN" },
  { code:"LU", name:"Luxembourg", format:"IBAN" },
  { code:"LV", name:"Latvia", format:"IBAN" },
  { code:"MC", name:"Monaco", format:"IBAN" },
  { code:"MD", name:"Moldova", format:"IBAN" },
  { code:"ME", name:"Montenegro", format:"IBAN" },
  { code:"MK", name:"North Macedonia", format:"IBAN" },
  { code:"MT", name:"Malta", format:"IBAN" },
  { code:"NO", name:"Norway", format:"IBAN" },
  { code:"PL", name:"Poland", format:"IBAN" },
  { code:"PT", name:"Portugal", format:"IBAN" },
  { code:"RO", name:"Romania", format:"IBAN" },
  { code:"RS", name:"Serbia", format:"IBAN" },
  { code:"SE", name:"Sweden", format:"IBAN" },
  { code:"SI", name:"Slovenia", format:"IBAN" },
  { code:"SK", name:"Slovakia", format:"IBAN" },
  { code:"SM", name:"San Marino", format:"IBAN" },
  { code:"TR", name:"Türkiye", format:"IBAN" },
  { code:"UA", name:"Ukraine", format:"IBAN" },
  { code:"VA", name:"Vatican City", format:"IBAN" },
  { code:"NX", name:"Nexora Bank", format:"10-digit Nexora account number" },
];

export default function BeneficiaryForm(){
  const [country,setCountry]=useState("US");
  const [bankName,setBankName]=useState("");
  const [bic,setBic]=useState("");
  const [bankFocused,setBankFocused]=useState(false);
  const [routingMessage,setRoutingMessage]=useState("");
  const [routingLoading,setRoutingLoading]=useState(false);
  const [externalLookupConsent,setExternalLookupConsent]=useState(false);
  const selected=countries.find(item=>item.code===country)!;
  const isIban=countries.some(item=>item.code===country && item.format==="IBAN");
  const suggestions=useMemo(()=>searchBanks(country,bankName),[country,bankName]);

  async function lookupUsRouting(value:string){
    const routing=value.replace(/\\D/g,"");
    if(country!=="US" || routing.length!==9) return;
    setRoutingLoading(true);
    setRoutingMessage("Looking up bank directory…");
    try{
      const response=await fetch(`/api/bank-directory/us?routing=${routing}`);
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||"Bank lookup unavailable.");
      setBankName(result.bankName);
      setRoutingMessage(`Directory match: ${result.bankName}${result.city&&result.state?` · ${result.city}, ${result.state}`:""}. This identifies the bank, not the account holder.`);
    }catch(error){
      setRoutingMessage(error instanceof Error?error.message:"Bank lookup unavailable. Enter the bank name manually.");
    }finally{setRoutingLoading(false);}
  }

  async function lookupUkSortCode(value:string){
    const sortCode=value.replace(/\D/g,"");
    if(country!=="GB" || sortCode.length!==6) return;
    setRoutingLoading(true);
    setRoutingMessage("Searching the UK live branch directory…");
    try{
      const response=await fetch(`/api/bank-directory/uk?sortCode=${sortCode}`);
      const result=await response.json();
      if(!response.ok) throw new Error(result.message||result.error||"No match in the available UK live directory.");
      setBankName(result.bankName);
      setRoutingMessage(`Directory match: ${result.bankName}${result.branchName?` · ${result.branchName}`:""} · ${result.source}. The free live endpoint currently covers HSBC UK only.`);
    }catch(error){
      setRoutingMessage(error instanceof Error?error.message:"UK bank lookup unavailable. Enter the bank name manually.");
    }finally{setRoutingLoading(false);}
  }

  async function lookupIban(value:string){
    const iban=value.replace(/\s/g,"").toUpperCase();
    if(!isIban || iban.length<15) return;
    setRoutingLoading(true);
    setRoutingMessage("Looking up bank directory…");
    try{
      if(country==="DE"){
        const bankCode=iban.slice(4,12);
        const response=await fetch(`/api/bank-directory/de?blz=${bankCode}`);
        const result=await response.json();
        if(!response.ok || !result.found) throw new Error(result.error||"No matching German bank code was found.");
        setBankName(result.bankName);
        if(result.bic) setBic(result.bic);
        setRoutingMessage(`Bundesbank directory match: ${result.bankName}${result.city?` · ${result.city}`:""} · BIC ${result.bic||"not listed"}.`);
        return;
      }
      if(!externalLookupConsent){
        setRoutingMessage("Select the external directory consent option before using the European lookup.");
        return;
      }
      const response=await fetch("/api/bank-directory/iban",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({iban,consent:true}),
      });
      const result=await response.json();
      if(!response.ok) throw new Error(result.error||"Bank lookup unavailable.");
      setBankName(result.bankName);
      if(result.bic) setBic(result.bic);
      setRoutingMessage(`Directory match: ${result.bankName}${result.city?` · ${result.city}`:""} · ${result.source}. This identifies the bank, not the account holder.`);
    }catch(error){
      setRoutingMessage(error instanceof Error?error.message:"Bank lookup unavailable. Enter the bank name manually.");
    }finally{setRoutingLoading(false);}
  }

  function changeCountry(value:string){
    setCountry(value);
    setBankName(value==="NX"?"Nexora Bank":"");
    setBic("");
    setRoutingMessage("");
    setExternalLookupConsent(false);
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
      <span className="form-hint">Bank suggestions are reference data. They do not confirm account ownership.</span>
    </label>
    {country==="US" && <>
      <label>Routing number<input name="routing_number" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} required placeholder="9-digit ABA routing number" onBlur={event=>lookupUsRouting(event.target.value)}/></label>
      {routingMessage&&<p className="form-hint" role="status">{routingLoading?"Looking up bank directory…":routingMessage}</p>}
      <label>Account number<input name="account_number" inputMode="numeric" pattern="[0-9]{4,17}" maxLength={17} required placeholder="Bank account number"/></label>
    </>}
    {country==="GB" && <>
      <label>Sort code<input name="sort_code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="6 digits, without spaces" onBlur={event=>lookupUkSortCode(event.target.value)}/></label>
      {routingMessage&&<p className="form-hint" role="status">{routingLoading?"Searching directory…":routingMessage}</p>}
      <label>Account number<input name="account_number" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required placeholder="8-digit account number"/></label>
    </>}
    {isIban && <>
      <label>IBAN<input name="iban" autoCapitalize="characters" minLength={15} maxLength={34} required placeholder="Enter IBAN" onBlur={event=>lookupIban(event.target.value)}/></label>
      {country!=="DE" && <label className="directory-consent-row"><input type="checkbox" checked={externalLookupConsent} onChange={event=>setExternalLookupConsent(event.target.checked)}/> I agree to send this IBAN to the external directory provider for bank identification.</label>}
      {routingMessage&&<p className="form-hint" role="status">{routingLoading?"Looking up bank directory…":routingMessage}</p>}
      <label>BIC / SWIFT (optional)<input name="bic" value={bic} onChange={event=>setBic(event.target.value.toUpperCase())} autoCapitalize="characters" maxLength={11} placeholder="Bank identifier code"/></label>
    </>}
    {country==="NX" && <label>Nexora account number<input name="account_number" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} required placeholder="10-digit account number"/></label>}
    <label>Nickname (optional)<input name="nickname" maxLength={60} placeholder="e.g. Rent"/></label>
    <button type="submit">Save beneficiary</button>
  </form>;
}
