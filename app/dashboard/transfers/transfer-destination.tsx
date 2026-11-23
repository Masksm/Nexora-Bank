"use client";
import Link from "next/link";
import { useMemo,useState } from "react";
import { ArrowUpRight,Globe2,Landmark,ShieldCheck,Wallet,PlusCircle,LockKeyhole,UserRound,CheckCircle2 } from "lucide-react";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { submitTransferWithPin } from "./secure-actions";
import { addBeneficiary } from "../beneficiaries/actions";
import { bankDirectory } from "@/lib/bank-directory";

type Account={account_id:string;account_number:string;account_name:string;status:string;balance_minor:number;currency:string};
type Beneficiary={id:string;beneficiary_name:string;bank_name:string;country_code:string;account_number:string|null;routing_number:string|null;sort_code:string|null;iban:string|null;bic:string|null;verification_status:string};
const countries=[["US","United States"],["NG","Nigeria"],["GB","United Kingdom"],["DE","Germany"],["FR","France"],["NL","Netherlands"],["ES","Spain"],["IE","Ireland"],["AT","Austria"],["BE","Belgium"],["CH","Switzerland"],["PT","Portugal"],["IT","Italy"],["SE","Sweden"],["DK","Denmark"],["FI","Finland"],["NO","Norway"],["PL","Poland"],["GR","Greece"],["LU","Luxembourg"],["CZ","Czechia"],["HU","Hungary"],["RO","Romania"],["BG","Bulgaria"],["HR","Croatia"],["SK","Slovakia"],["SI","Slovenia"],["CY","Cyprus"],["EE","Estonia"],["LV","Latvia"],["LT","Lithuania"],["MT","Malta"],["IS","Iceland"],["LI","Liechtenstein"],["MC","Monaco"],["RS","Serbia"],["TR","Türkiye"],["UA","Ukraine"]];
const ibanCountries=new Set(countries.map(([code])=>code).filter(code=>code!=="US"&&code!=="GB"));
function money(minor:number,locale:SupportedLocale,currency:string){return new Intl.NumberFormat(locale,{style:"currency",currency}).format(minor/100);}
export function TransferDestination({accounts,beneficiaries,locale}:{accounts:Account[];beneficiaries:Beneficiary[];locale:SupportedLocale}){
 const [mode,setMode]=useState<"internal"|"international">("internal");
 const [country,setCountry]=useState("US");
 const [recipientMode,setRecipientMode]=useState<"manual"|"saved">("manual");
 const [beneficiaryId,setBeneficiaryId]=useState("");
 const [sourceId,setSourceId]=useState(accounts.find(a=>a.status==="active")?.account_id??accounts[0]?.account_id??"");
 const [bankName,setBankName]=useState("");
 const [recipientName,setRecipientName]=useState("");
 const [accountNumber,setAccountNumber]=useState("");
 const [routingNumber,setRoutingNumber]=useState("");
 const [sortCode,setSortCode]=useState("");
 const [iban,setIban]=useState("");
 const [bic,setBic]=useState("");
 const [amount,setAmount]=useState("");
 const [consent,setConsent]=useState(false);
 const [verification,setVerification]=useState("");
 const [verificationBusy,setVerificationBusy]=useState(false);
 const [verificationStatus,setVerificationStatus]=useState("");
 const [reviewed,setReviewed]=useState(false);
 const t=(value:string)=>pageText(locale,value),active=accounts.filter(a=>a.status==="active");
 const countryRecipients=useMemo(()=>beneficiaries.filter(b=>b.country_code===country),[beneficiaries,country]);
 const bankOptions=useMemo(()=>bankDirectory.filter(bank=>bank.country===country),[country]);
 const chosen=countryRecipients.find(b=>b.id===beneficiaryId)??null;
 const usesIban=ibanCountries.has(country);
 function clearRecipient(){setBeneficiaryId("");setBankName("");setRecipientName("");setAccountNumber("");setRoutingNumber("");setSortCode("");setIban("");setBic("");setVerification("");setVerificationStatus("");setReviewed(false);}
 function changeCountry(value:string){setCountry(value);clearRecipient();setRecipientMode("manual");setConsent(false);}
 function selectBeneficiary(id:string){
  setBeneficiaryId(id);
  const item=countryRecipients.find(b=>b.id===id);
  if(item){setBankName(item.bank_name);setRecipientName(item.beneficiary_name);setAccountNumber(item.account_number||"");setRoutingNumber(item.routing_number||"");setSortCode(item.sort_code||"");setIban(item.iban||"");setBic(item.bic||"");setVerification("");setVerificationStatus("");setReviewed(false);}
 }
 async function verifyRecipient(){
  if(!consent||verificationBusy)return;
  if(!beneficiaryId&&country!=="NG"&&(!usesIban||!iban)){setVerification("Live account-name confirmation is not available for this account format.");return;}
  setVerificationBusy(true);setVerification("");setVerificationStatus("");
  try{
   const payload=beneficiaryId?{beneficiaryId,consent:true}:{manualRecipient:{countryCode:country,name:recipientName,iban,accountNumber,bankName},consent:true};
   const response=await fetch("/api/bank-account-verification/verify-name",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||"The name comparison could not be completed.");
   const labels:Record<string,string>={match:"Recipient name matches the sandbox comparison.",partial_match:"Recipient name is a partial match in the sandbox.",no_match:"Recipient name does not match the sandbox comparison.",unavailable:"The provider returned no name-comparison result."};
   setVerification(labels[result.status]||"No comparison result is available.");
   setVerificationStatus(result.status);
  }catch(error){setVerification(error instanceof Error?error.message:"The name comparison could not be completed.");}
  finally{setVerificationBusy(false);}
 }
 function reviewDetails(){
  if(!active.some(a=>a.account_id===sourceId)||!recipientName.trim()||!bankName.trim()||!amount||Number(amount)<=0){setVerification("Complete the source account, recipient name, bank and a valid amount before reviewing.");return;}
  if(country==="US"&&(!/^\\d{9}$/.test(routingNumber)||!/^\\d{4,17}$/.test(accountNumber))){setVerification("Enter a valid 9-digit routing number and account number.");return;}
  if(country==="GB"&&(!/^\\d{6}$/.test(sortCode)||!/^\\d{8}$/.test(accountNumber))){setVerification("Enter a valid 6-digit sort code and 8-digit account number.");return;}
  if(usesIban&&!iban.trim()){setVerification("Enter the recipient IBAN.");return;}\n  if(country==="NG"&&(!/^\\d{10}$/.test(accountNumber)||!bankName.trim())){setVerification("Enter a 10-digit Nigerian account number and select the bank.");return;}
  setVerification("");setReviewed(true);
 }
 return <section className="workspace-panel transfer-destination-panel">
  <div className="transfer-mode-switch" role="tablist" aria-label={t("Transfer type")}>
   <button type="button" role="tab" aria-selected={mode==="internal"} className={mode==="internal"?"active":""} onClick={()=>setMode("internal")}><Wallet size={16}/><span><strong>{t("Internal transfer")}</strong><small>{t("Send to another Nexora account")}</small></span></button>
   <button type="button" role="tab" aria-selected={mode==="international"} className={mode==="international"?"active":""} onClick={()=>setMode("international")}><Globe2 size={16}/><span><strong>{t("International transfer")}</strong><small>{t("Prepare a transfer to an overseas bank")}</small></span></button>
  </div>
  {mode==="internal"?<><div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("NEW PAYMENT")}</span><h2>{t("Transfer details")}</h2></div></div>{active.length?<form action={submitTransferWithPin} className="transfer-form">
   <label>{t("Pay from")}<select name="account_id" value={sourceId} onChange={e=>setSourceId(e.target.value)} required>{active.map(a=><option key={a.account_id} value={a.account_id}>{a.account_name} · {a.account_number} · {money(Number(a.balance_minor),locale,a.currency)}</option>)}</select></label>
   <label>{t("Recipient account number")}<input name="recipient" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder={t("10-digit Nexora account number")} required/></label>
   <label>{t("Amount")} ({active.find(a=>a.account_id===sourceId)?.currency??active[0]?.currency??"USD"})<input name="amount" type="number" min="0.01" step="0.01" placeholder={t("250.00")} required/></label>
   <label>{t("Description (optional)")}<input name="description" maxLength={160} placeholder={t("What is this transfer for?")}/></label>
   <label>Transaction PIN<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" required/></label>
   <button type="submit">{t("Review and send transfer")} <ArrowUpRight size={15}/></button>
   <p>{t("Transfers from new or unrecognized devices are held for manual security review before processing.")}</p>
  </form>:<div className="workspace-alert">{t("You need an active Nexora account before sending an internal transfer.")}</div>}</>:<div className="international-transfer-content">
   <div className="international-transfer-heading"><span className="international-transfer-icon"><Globe2 size={22}/></span><div><span className="workspace-kicker">{t("GLOBAL PAYMENTS")}</span><h2>{t("International bank transfer")}</h2><p>{t("Enter recipient bank details manually or choose a saved beneficiary. Saving a new recipient is optional.")}</p></div></div>
   <div className="international-transfer-grid">
    <label>{t("Pay from")}<select value={sourceId} onChange={e=>{setSourceId(e.target.value);setReviewed(false);}} disabled={!active.length}><option value="">{t("Select a source account")}</option>{active.map(a=><option key={a.account_id} value={a.account_id}>{a.account_name} · {a.account_number} · {money(Number(a.balance_minor),locale,a.currency)}</option>)}</select></label>
    <label>{t("Destination country")}<select value={country} onChange={e=>changeCountry(e.target.value)}>{countries.map(([code,name])=><option key={code} value={code}>{t(name)}</option>)}</select></label>
    <div className="recipient-entry-mode"><button type="button" className={recipientMode==="manual"?"active":""} onClick={()=>{setRecipientMode("manual");clearRecipient();}}>{t("Enter details manually")}</button><button type="button" className={recipientMode==="saved"?"active":""} onClick={()=>{setRecipientMode("saved");clearRecipient();}}>{t("Use saved beneficiary")}</button></div>
   </div>
   {recipientMode==="saved"?<div className="international-transfer-grid">
    <label className="international-recipient-select">{t("Saved beneficiary")}<select value={beneficiaryId} onChange={e=>selectBeneficiary(e.target.value)}><option value="">{t("Select a saved recipient")}</option>{countryRecipients.map(b=><option key={b.id} value={b.id}>{b.bank_name} · {b.beneficiary_name}</option>)}</select></label>
    {chosen&&<div className="international-recipient-card"><div className="international-recipient-card-head"><span><Landmark size={17}/>{chosen.bank_name}</span><span className={chosen.verification_status==="verified"?"recipient-verified":"recipient-unverified"}>{chosen.verification_status==="verified"?<ShieldCheck size={13}/>:<LockKeyhole size={13}/>} {t(chosen.verification_status==="verified"?"Name verified by provider":"Verification status not confirmed")}</span></div><h3>{chosen.beneficiary_name}</h3><p>{t(countries.find(([code])=>code===chosen.country_code)?.[1]??chosen.country_code)}</p><dl>{chosen.iban&&<div><dt>IBAN</dt><dd>{chosen.iban.slice(0,4)}••••••••{chosen.iban.slice(-4)}</dd></div>}{chosen.account_number&&<div><dt>Account number</dt><dd>••••{chosen.account_number.slice(-4)}</dd></div>}{chosen.routing_number&&<div><dt>Routing number</dt><dd>{chosen.routing_number}</dd></div>}{chosen.sort_code&&<div><dt>Sort code</dt><dd>{chosen.sort_code}</dd></div>}{chosen.bic&&<div><dt>BIC / SWIFT</dt><dd>{chosen.bic}</dd></div>}</dl><Link href="/dashboard/beneficiaries">{t("Manage this beneficiary")} <ArrowUpRight size={14}/></Link></div>}
    {!countryRecipients.length&&<p className="form-hint">{t("No saved beneficiaries exist for this country. Switch to manual entry to continue.")}</p>}
   </div>:<div className="international-transfer-grid">
    <label>{t("Bank name")}<input value={bankName} onChange={e=>{setBankName(e.target.value);setReviewed(false);}} list="international-bank-options" maxLength={120} placeholder={t("Enter or select the recipient bank")}/><datalist id="international-bank-options">{bankOptions.map(bank=><option key={bank.name} value={bank.name}/>)}</datalist></label>
    {country==="NG"&&<label>{t("Account number")}<input value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/\\D/g,"").slice(0,10))} inputMode="numeric" maxLength={10} placeholder="10-digit NUBAN account number"/></label>}\n    {country==="US"&&<><label>{t("Routing number")}<input value={routingNumber} onChange={e=>setRoutingNumber(e.target.value.replace(/\\D/g,"").slice(0,9))} inputMode="numeric" placeholder="9-digit ABA routing number"/></label><label>{t("Account number")}<input value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/\\D/g,"").slice(0,17))} inputMode="numeric" placeholder={t("Recipient bank account number")}/></label></>}
    {country==="GB"&&<><label>{t("Sort code")}<input value={sortCode} onChange={e=>setSortCode(e.target.value.replace(/\\D/g,"").slice(0,6))} inputMode="numeric" placeholder="6 digits"/></label><label>{t("Account number")}<input value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/\\D/g,"").slice(0,8))} inputMode="numeric" placeholder="8 digits"/></label><label>{t("IBAN (optional)")}<input value={iban} onChange={e=>setIban(e.target.value.toUpperCase().replace(/\\s/g,""))} autoCapitalize="characters" placeholder="GB…"/></label></>}
    {usesIban&&<label>{t("IBAN")}<input value={iban} onChange={e=>setIban(e.target.value.toUpperCase().replace(/\\s/g,""))} autoCapitalize="characters" maxLength={34} placeholder={t("Enter recipient IBAN")}/></label>}
    <label>{t("BIC / SWIFT (optional)")}<input value={bic} onChange={e=>setBic(e.target.value.toUpperCase().replace(/\\s/g,"").slice(0,11))} autoCapitalize="characters" placeholder="BIC / SWIFT"/></label>
    <label>{t("Recipient account-holder name")}<input value={recipientName} onChange={e=>{setRecipientName(e.target.value);setVerification("");setReviewed(false);}} maxLength={100} placeholder={t("Full name of the recipient")}/></label>
    <div className="recipient-name-preview"><span><UserRound size={16}/>{t("Recipient")}</span><strong>{recipientName.trim()||t("Recipient name will appear here")}</strong></div>
    {((usesIban&&iban)||(country==="NG"&&accountNumber.length===10&&bankName.trim()))&&<div className="recipient-verification-box"><label className="directory-consent-row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t(country==="NG"?"I consent to sending the Nigerian account number, bank and recipient name to the live account-name enquiry provider.":"I consent to sending the IBAN and recipient name to the live Verification of Payee provider.")}</label><button type="button" onClick={()=>void verifyRecipient()} disabled={!consent||verificationBusy||!recipientName.trim()}>{verificationBusy?t("Checking…"):t("Check recipient name")}</button>{verification&&<p className={verificationStatus==="match"?"name-check-match":verificationStatus==="no_match"?"name-check-no-match":""} role="status">{verification} {verificationStatus&&<span>{t("Provider: live bank enquiry")}</span>}</p>}</div>}
    <form action={addBeneficiary} className="save-manual-beneficiary">
     <input type="hidden" name="country_code" value={country}/><input type="hidden" name="name" value={recipientName}/><input type="hidden" name="bank_name" value={bankName}/><input type="hidden" name="account_number" value={accountNumber}/><input type="hidden" name="routing_number" value={routingNumber}/><input type="hidden" name="sort_code" value={sortCode}/><input type="hidden" name="iban" value={iban}/><input type="hidden" name="bic" value={bic}/>
     <button type="submit" disabled={!recipientName.trim()||!bankName.trim()}><PlusCircle size={15}/>{t("Save these details as a beneficiary (optional)")}</button>
    </form>
   </div>}
   <div className="international-transfer-actions"><label>{t("Transfer amount")} ({active.find(a=>a.account_id===sourceId)?.currency??"USD"})<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);setReviewed(false);}} placeholder="250.00"/></label><button type="button" onClick={reviewDetails}>{t("Review transfer details")} <ArrowUpRight size={15}/></button></div>
   {verification&&!reviewed&&<p className="form-hint" role="status">{verification}</p>}
   {reviewed&&<div className="international-recipient-card"><div className="international-recipient-card-head"><span><CheckCircle2 size={17}/>{t("Details ready for review")}</span></div><h3>{recipientName}</h3><p>{bankName} · {t(countries.find(([code])=>code===country)?.[1]??country)}</p><strong>{new Intl.NumberFormat(locale,{style:"currency",currency:active.find(a=>a.account_id===sourceId)?.currency||"USD"}).format(Number(amount))}</strong><p>{t("Your recipient and amount details have been prepared. This review does not submit or execute an external payment.")}</p></div>}
  </div>}
 </section>;
}
