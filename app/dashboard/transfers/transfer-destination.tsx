"use client";
import Link from "next/link";
import { useEffect,useMemo,useState } from "react";
import type { FormEvent } from "react";
import { ArrowUpRight,Globe2,Landmark,ShieldCheck,Wallet,PlusCircle,LockKeyhole,UserRound,CheckCircle2 } from "lucide-react";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { submitTransferWithPin, completeTransferWithOtp } from "./secure-actions";
import { getExternalTransferStatus,submitExternalTransferRequest } from "./international-actions";
import { addBeneficiary } from "../beneficiaries/actions";
import { bankDirectory } from "@/lib/bank-directory";

type Account={account_id:string;account_number:string;account_name:string;status:string;balance_minor:number;currency:string};
type Beneficiary={id:string;beneficiary_name:string;bank_name:string;country_code:string;account_number:string|null;routing_number:string|null;sort_code:string|null;iban:string|null;bic:string|null;verification_status:string};
const countries=[["US","United States"],["GB","United Kingdom"],["DE","Germany"],["FR","France"],["NL","Netherlands"],["ES","Spain"],["IE","Ireland"],["AT","Austria"],["BE","Belgium"],["CH","Switzerland"],["PT","Portugal"],["IT","Italy"],["SE","Sweden"],["DK","Denmark"],["FI","Finland"],["NO","Norway"],["PL","Poland"],["GR","Greece"],["LU","Luxembourg"],["CZ","Czechia"],["HU","Hungary"],["RO","Romania"],["BG","Bulgaria"],["HR","Croatia"],["SK","Slovakia"],["SI","Slovenia"],["CY","Cyprus"],["EE","Estonia"],["LV","Latvia"],["LT","Lithuania"],["MT","Malta"],["IS","Iceland"],["LI","Liechtenstein"],["MC","Monaco"],["RS","Serbia"],["TR","Türkiye"],["UA","Ukraine"]];
const ibanCountries=new Set(countries.map(([code])=>code).filter(code=>code!=="US"&&code!=="GB"));
function money(minor:number,locale:SupportedLocale,currency:string){return new Intl.NumberFormat(locale,{style:"currency",currency}).format(minor/100);}
export function TransferDestination({accounts,beneficiaries,locale}:{accounts:Account[];beneficiaries:Beneficiary[];locale:SupportedLocale}){
 const [mode,setMode]=useState<"internal"|"international">("internal");
 const [country,setCountry]=useState("US");
 const [recipientMode,setRecipientMode]=useState<"manual"|"saved">("manual");
 const [beneficiaryId,setBeneficiaryId]=useState("");
 const [sourceId,setSourceId]=useState(accounts.find(a=>a.status==="active"&&a.currency==="USD")?.account_id??accounts.find(a=>a.status==="active")?.account_id??accounts[0]?.account_id??"");
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
 const [verificationProvider,setVerificationProvider]=useState("");
 const [reviewed,setReviewed]=useState(false);
 const [transferOtpRequired,setTransferOtpRequired]=useState(false);
 const [transferOtpCode,setTransferOtpCode]=useState("");
 const [transferBusy,setTransferBusy]=useState(false);
 const [transferMessage,setTransferMessage]=useState("");
 const [externalOtpRequired,setExternalOtpRequired]=useState(false);
 const [externalOtpCode,setExternalOtpCode]=useState("");
 const [externalBusy,setExternalBusy]=useState(false);
 const [externalMessage,setExternalMessage]=useState("");
 const [externalReview,setExternalReview]=useState<{requestId:string;reference:string;status:"pending"|"approved"|"rejected";reason:string|null}|null>(null);
 const t=(value:string)=>pageText(locale,value),active=accounts.filter(a=>a.status==="active"),usdAccounts=active.filter(a=>a.currency==="USD");
 const externalRequestId=externalReview?.requestId;
 const externalReviewStatus=externalReview?.status;
 useEffect(()=>{
  if(!externalRequestId||externalReviewStatus!=="pending")return;
  let stopped=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const poll=async()=>{
   const result=await getExternalTransferStatus(externalRequestId);
   if(stopped)return;
   if(result?.status==="approved"||result?.status==="rejected"){
    setExternalReview(current=>current&&current.requestId===externalRequestId?{...current,status:result.status as "approved"|"rejected",reason:result.reason??null}:current);
    return;
   }
   timer=setTimeout(()=>void poll(),3000);
  };
  void poll();
  return()=>{stopped=true;if(timer)clearTimeout(timer);};
 },[externalRequestId,externalReviewStatus]);

 const countryRecipients=useMemo(()=>beneficiaries.filter(b=>b.country_code===country),[beneficiaries,country]);
 const bankOptions=useMemo(()=>bankDirectory.filter(bank=>bank.country===country),[country]);
 const chosen=countryRecipients.find(b=>b.id===beneficiaryId)??null;
 const usesIban=ibanCountries.has(country);
 const canValidateIban=usesIban||country==="GB";
 function clearRecipient(){setBeneficiaryId("");setBankName("");setRecipientName("");setAccountNumber("");setRoutingNumber("");setSortCode("");setIban("");setBic("");setVerification("");setVerificationStatus("");setVerificationProvider("");setReviewed(false);}
 function changeCountry(value:string){setCountry(value);clearRecipient();setRecipientMode("manual");setConsent(false);}
 function selectBeneficiary(id:string){
  setBeneficiaryId(id);
  const item=countryRecipients.find(b=>b.id===id);
  if(item){setBankName(item.bank_name);setRecipientName(item.beneficiary_name);setAccountNumber(item.account_number||"");setRoutingNumber(item.routing_number||"");setSortCode(item.sort_code||"");setIban(item.iban||"");setBic(item.bic||"");setVerification("");setVerificationStatus("");setReviewed(false);}
 }
 async function handleExternalTransferSubmit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(externalBusy)return;
  setExternalBusy(true);setExternalMessage("");
  try{
   const result=await submitExternalTransferRequest(new FormData(event.currentTarget));
   if(result?.status==="otp_required"){
    setExternalOtpRequired(true);
    setExternalMessage("A six-digit verification code has been sent to your registered email. Enter it to submit this international transfer request.");
   }else if(result?.status==="submitted"&&result.requestId&&result.reference){
    setExternalOtpRequired(false);setExternalOtpCode("");setExternalMessage("");
    setExternalReview({requestId:result.requestId,reference:result.reference,status:"pending",reason:null});
   }else if(result?.error){
    setExternalMessage(result.error);
   }
  }catch(error){
   setExternalMessage(error instanceof Error?error.message:"The international transfer request could not be submitted.");
  }finally{
   setExternalBusy(false);
  }
 }
 async function verifyRecipient(){
  if(!consent||verificationBusy)return;
  if(!beneficiaryId&&country!=="NG"&&(!canValidateIban||!iban)){setVerification("IBAN validation is not available for this account format.");return;}
  setVerificationBusy(true);setVerification("");setVerificationStatus("");setVerificationProvider("");
  try{
   const payload=beneficiaryId?{beneficiaryId,consent:true}:{manualRecipient:{countryCode:country,name:recipientName,iban,accountNumber,bankName},consent:true};
   const response=await fetch("/api/bank-account-verification/verify-name",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error||"The name comparison could not be completed.");
   const labels:Record<string,string>={
    valid:"The IBAN passed validation. Account ownership has not been confirmed.",
    invalid:"The IBAN failed validation. Check the recipient details.",
    sandbox:"Sandbox simulation only. This is not a real bank verification.",
    match:"The provider returned a matching account-name result.",
    partial_match:"The provider returned a partial account-name result.",
    no_match:"The provider returned a different account-name result.",
    unavailable:"The provider could not complete the check."
   };
   setVerification((result.message||labels[result.status]||"No verification result is available.")+(result.provider?" Provider: "+result.provider+".":"")+(result.accountName?" Account name returned: "+result.accountName:""));
   setVerificationStatus(result.status);
   setVerificationProvider(result.provider||"");
  }catch(error){setVerification(error instanceof Error?error.message:"The name comparison could not be completed.");}
  finally{setVerificationBusy(false);}
 }
 async function handleInternalTransferSubmit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(transferBusy)return;
  setTransferBusy(true);setTransferMessage("");
  const formData=new FormData(event.currentTarget);
  try{
   if(transferOtpRequired){
    const result=await completeTransferWithOtp(formData);
    if(result?.error)setTransferMessage(result.error);
   }else{
    const result=await submitTransferWithPin(formData);
    if(result?.status==="otp_required"){
     setTransferOtpRequired(true);
     setTransferMessage("A six-digit verification code has been sent to your registered email. Enter it to submit this transfer.");
    }else if(result?.error){
     setTransferMessage(result.error);
    }
   }
  }catch(error){
   setTransferMessage(error instanceof Error?error.message:"The transfer could not be submitted.");
  }finally{
   setTransferBusy(false);
  }
 }
 function reviewDetails(){
  if(!usdAccounts.some(a=>a.account_id===sourceId)||!recipientName.trim()||!bankName.trim()||!amount||Number(amount)<=0){setVerification("Select an active USD account, then complete the recipient name, bank and a valid amount.");return;}
  if(country==="US"&&(!/^\d{9}$/.test(routingNumber)||!/^\d{4,17}$/.test(accountNumber))){setVerification("Enter a valid 9-digit routing number and account number.");return;}
  if(country==="GB"&&(!/^\d{6}$/.test(sortCode)||!/^\d{8}$/.test(accountNumber))){setVerification("Enter a valid 6-digit sort code and 8-digit account number.");return;}
  if(usesIban&&!iban.trim()){setVerification("Enter the recipient IBAN.");return;}
  if(country==="NG"&&(!/^\d{10}$/.test(accountNumber)||!bankName.trim())){setVerification("Enter a 10-digit Nigerian account number and select the bank.");return;}
  setVerification("");setReviewed(true);
 }
 return (<section className="workspace-panel transfer-destination-panel">
  <div className="transfer-mode-switch" role="tablist" aria-label={t("Transfer type")}>
   <button type="button" role="tab" aria-selected={mode==="internal"} className={mode==="internal"?"active":""} onClick={()=>setMode("internal")}><Wallet size={16}/><span><strong>{t("Internal transfer")}</strong><small>{t("Send to another Nexora account")}</small></span></button>
   <button type="button" role="tab" aria-selected={mode==="international"} className={mode==="international"?"active":""} onClick={()=>setMode("international")}><Globe2 size={16}/><span><strong>{t("International transfer")}</strong><small>{t("Prepare a transfer to an overseas bank")}</small></span></button>
  </div>
  {mode==="internal" ? (<><div className="workspace-panel-heading"><div><span className="workspace-kicker">{t("NEW PAYMENT")}</span><h2>{t("Transfer details")}</h2></div></div>{active.length?<form onSubmit={handleInternalTransferSubmit} className="transfer-form">
   <label>{t("Pay from")}<select name="account_id" value={sourceId} onChange={e=>setSourceId(e.target.value)} required>{active.map(a=><option key={a.account_id} value={a.account_id}>{a.account_name} · {a.account_number} · {money(Number(a.balance_minor),locale,a.currency)}</option>)}</select></label>
   <label>{t("Recipient account number")}<input name="recipient" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder={t("10-digit Nexora account number")} required/></label>
   <label>{t("Amount")} ({active.find(a=>a.account_id===sourceId)?.currency??active[0]?.currency??"USD"})<input name="amount" type="number" min="0.01" step="0.01" placeholder={t("250.00")} required/></label>
   <label>{t("Description (optional)")}<input name="description" maxLength={160} placeholder={t("What is this transfer for?")}/></label>
   <label>Transaction PIN<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" required/></label>
   {transferOtpRequired&&<label>Email verification code<input name="otp_code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={transferOtpCode} onChange={e=>setTransferOtpCode(e.target.value)} required/></label>}
   {transferMessage&&<p className="form-hint" role="status">{transferMessage}</p>}
   {transferOtpRequired&&<button type="button" className="external-transfer-back" onClick={()=>{setTransferOtpRequired(false);setTransferOtpCode("");setTransferMessage("");}}>Edit transfer details</button>}
   <button type="submit" disabled={transferBusy}>{transferBusy?"Processing…":transferOtpRequired?"Verify code and submit transfer":t("Review and send transfer")} <ArrowUpRight size={15}/></button>

  </form>:<div className="workspace-alert">{t("You need an active Nexora account before sending an internal transfer.")}</div>}</>) : (<div className="international-transfer-content">
   <div className="international-transfer-heading"><span className="international-transfer-icon"><Globe2 size={22}/></span><div><span className="workspace-kicker">{t("GLOBAL PAYMENTS")}</span><h2>{t("International bank transfer")}</h2><p>{t("Enter recipient bank details manually or choose a saved beneficiary. Saving a new recipient is optional.")}</p></div></div>
   <div className="international-transfer-grid">
    <label>{t("Pay from")}<select value={sourceId} onChange={e=>{setSourceId(e.target.value);setReviewed(false);}} disabled={!usdAccounts.length}><option value="">{t("Select a USD source account")}</option>{usdAccounts.map(a=><option key={a.account_id} value={a.account_id}>{a.account_name} · {a.account_number} · {money(Number(a.balance_minor),locale,a.currency)}</option>)}</select></label>
    <label>{t("Destination country")}<select value={country} onChange={e=>changeCountry(e.target.value)}>{countries.map(([code,name])=><option key={code} value={code}>{t(name)}</option>)}</select></label>
    <div className="recipient-entry-mode"><button type="button" className={recipientMode==="manual"?"active":""} onClick={()=>{setRecipientMode("manual");clearRecipient();}}>{t("Enter details manually")}</button><button type="button" className={recipientMode==="saved"?"active":""} onClick={()=>{setRecipientMode("saved");clearRecipient();}}>{t("Use saved beneficiary")}</button></div>
   </div>
   {recipientMode==="saved"?<div className="international-transfer-grid">
    <label className="international-recipient-select">{t("Saved beneficiary")}<select value={beneficiaryId} onChange={e=>selectBeneficiary(e.target.value)}><option value="">{t("Select a saved recipient")}</option>{countryRecipients.map(b=><option key={b.id} value={b.id}>{b.bank_name} · {b.beneficiary_name}</option>)}</select></label>
    {chosen&&<div className="international-recipient-card"><div className="international-recipient-card-head"><span><Landmark size={17}/>{chosen.bank_name}</span><span className={chosen.verification_status==="verified"?"recipient-verified":"recipient-unverified"}>{chosen.verification_status==="verified"?<ShieldCheck size={13}/>:<LockKeyhole size={13}/>} {t(chosen.verification_status==="verified"?"Name verified by provider":"Verification status not confirmed")}</span></div><h3>{chosen.beneficiary_name}</h3><p>{t(countries.find(([code])=>code===chosen.country_code)?.[1]??chosen.country_code)}</p><dl>{chosen.iban&&<div><dt>IBAN</dt><dd>{chosen.iban.slice(0,4)}••••••••{chosen.iban.slice(-4)}</dd></div>}{chosen.account_number&&<div><dt>Account number</dt><dd>••••{chosen.account_number.slice(-4)}</dd></div>}{chosen.routing_number&&<div><dt>Routing number</dt><dd>{chosen.routing_number}</dd></div>}{chosen.sort_code&&<div><dt>Sort code</dt><dd>{chosen.sort_code}</dd></div>}{chosen.bic&&<div><dt>BIC / SWIFT</dt><dd>{chosen.bic}</dd></div>}</dl><Link href="/dashboard/beneficiaries">{t("Manage this beneficiary")} <ArrowUpRight size={14}/></Link></div>}
    {!countryRecipients.length&&<p className="form-hint">{t("No saved beneficiaries exist for this country. Switch to manual entry to continue.")}</p>}
   </div>:<div className="international-transfer-grid">
    <label>{t("Bank name")}<input value={bankName} onChange={e=>{setBankName(e.target.value);setReviewed(false);}} list="international-bank-options" maxLength={120} placeholder={t("Enter or select the recipient bank")}/><datalist id="international-bank-options">{bankOptions.map(bank=><option key={bank.name} value={bank.name}/>)}</datalist></label>
    {country==="NG"&&<label>{t("Account number")}<input value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/\D/g,"").slice(0,10))} inputMode="numeric" maxLength={10} placeholder="10-digit NUBAN account number"/></label>}
    {country==="US"&&<><label>{t("Routing number")}<input value={routingNumber} onChange={e=>setRoutingNumber(e.target.value.replace(/\D/g,"").slice(0,9))} inputMode="numeric" placeholder="9-digit ABA routing number"/></label><label>{t("Account number")}<input value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/\D/g,"").slice(0,17))} inputMode="numeric" placeholder={t("Recipient bank account number")}/></label></>}
    {country==="GB"&&<><label>{t("Sort code")}<input value={sortCode} onChange={e=>setSortCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" placeholder="6 digits"/></label><label>{t("Account number")}<input value={accountNumber} onChange={e=>setAccountNumber(e.target.value.replace(/\D/g,"").slice(0,8))} inputMode="numeric" placeholder="8 digits"/></label><label>{t("IBAN (optional)")}<input value={iban} onChange={e=>setIban(e.target.value.toUpperCase().replace(/\s/g,""))} autoCapitalize="characters" placeholder="GB…"/></label></>}
    {usesIban&&<label>{t("IBAN")}<input value={iban} onChange={e=>setIban(e.target.value.toUpperCase().replace(/\s/g,""))} autoCapitalize="characters" maxLength={34} placeholder={t("Enter recipient IBAN")}/></label>}
    <label>{t("BIC / SWIFT (optional)")}<input value={bic} onChange={e=>setBic(e.target.value.toUpperCase().replace(/\s/g,"").slice(0,11))} autoCapitalize="characters" placeholder="BIC / SWIFT"/></label>
    <label>{t("Recipient account-holder name")}<input value={recipientName} onChange={e=>{setRecipientName(e.target.value);setVerification("");setReviewed(false);}} maxLength={100} placeholder={t("Full name of the recipient")}/></label>
    <div className="recipient-name-preview"><span><UserRound size={16}/>{t("Recipient")}</span><strong>{recipientName.trim()||t("Recipient name will appear here")}</strong></div>
    {((canValidateIban&&iban)||(country==="NG"&&accountNumber.length===10&&bankName.trim()))&&<div className="recipient-verification-box"><label className="directory-consent-row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t(country==="NG"?"I consent to sending the Nigerian account number, bank and recipient name to the live account-name enquiry provider.":"I consent to sending the recipient IBAN to IBANforge for structural and checksum validation. This does not verify account ownership.")}</label><button type="button" onClick={()=>void verifyRecipient()} disabled={!consent||verificationBusy||(country==="NG"&&!recipientName.trim())}>{verificationBusy?t("Checking…"):t(country==="NG"?"Verify account-holder name":"Validate IBAN")}</button>{verification&&<p className={verificationStatus==="match"?"name-check-match":verificationStatus==="no_match"?"name-check-no-match":""} role="status">{verification} {verificationProvider==="IBANforge"&&<span> <a href="https://ibanforge.com" target="_blank" rel="noreferrer">Powered by IBANforge</a></span>} {verificationStatus&&<span>{t("Provider response")}</span>}</p>}</div>}
    <form action={addBeneficiary} className="save-manual-beneficiary">
     <input type="hidden" name="country_code" value={country}/><input type="hidden" name="name" value={recipientName}/><input type="hidden" name="bank_name" value={bankName}/><input type="hidden" name="account_number" value={accountNumber}/><input type="hidden" name="routing_number" value={routingNumber}/><input type="hidden" name="sort_code" value={sortCode}/><input type="hidden" name="iban" value={iban}/><input type="hidden" name="bic" value={bic}/>
     <button type="submit" disabled={!recipientName.trim()||!bankName.trim()}><PlusCircle size={15}/>{t("Save these details as a beneficiary (optional)")}</button>
    </form>
   </div>}
   <div className="international-transfer-actions"><label>{t("Transfer amount")} (USD)<input type="number" min="0.01" step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);setReviewed(false);}} placeholder="250.00"/></label><button type="button" onClick={reviewDetails}>{t("Review transfer details")} <ArrowUpRight size={15}/></button></div>
   {verification&&!reviewed&&<p className="form-hint" role="status">{verification}</p>}
   {reviewed&&<div className="international-recipient-card"><div className="international-recipient-card-head"><span><CheckCircle2 size={17}/>{t("Review transfer")}</span></div><h3>{recipientName}</h3><p>{bankName} · {t(countries.find(([code])=>code===country)?.[1]??country)}</p><strong>{new Intl.NumberFormat(locale,{style:"currency",currency:"USD"}).format(Number(amount))}</strong><p>{t("Confirm the recipient and amount, then submit your transfer request for administrator review.")}</p>
    <form onSubmit={handleExternalTransferSubmit} className="external-transfer-submit-form">
     <input type="hidden" name="source_account_id" value={sourceId}/>
     <input type="hidden" name="country" value={country}/>
     <input type="hidden" name="bank_name" value={bankName}/>
     <input type="hidden" name="beneficiary_name" value={recipientName}/>
     <input type="hidden" name="account_number" value={accountNumber}/>
     <input type="hidden" name="routing_number" value={routingNumber}/>
     <input type="hidden" name="sort_code" value={sortCode}/>
     <input type="hidden" name="iban" value={iban}/>
     <input type="hidden" name="bic" value={bic}/>
     <input type="hidden" name="amount" value={amount}/>
     <label>{t("Transaction PIN")}<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" required placeholder={t("Enter your six-digit PIN")}/></label>
     {externalOtpRequired&&<label>Email verification code<input name="otp_code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={externalOtpCode} onChange={e=>setExternalOtpCode(e.target.value)} required/></label>}
     {externalMessage&&<p className="form-hint" role="status">{externalMessage}</p>}
     <div><button type="button" className="external-transfer-back" onClick={()=>{setReviewed(false);setExternalOtpRequired(false);setExternalOtpCode("");setExternalMessage("");}}>{t("Edit details")}</button><button type="submit" disabled={externalBusy}>{externalBusy?"Processing…":externalOtpRequired?"Verify code and submit request":t("Submit transfer")} <ArrowUpRight size={15}/></button></div>
    </form>
   </div>}
  </div>)}
  {externalReview&&<div className="external-review-overlay" role="dialog" aria-modal="true" aria-labelledby="external-review-title">
   <div className="external-review-modal">
    {externalReview.status==="pending"?<div className="external-review-loader" role="status" aria-label="Awaiting administrator decision"><span className="external-review-spinner"/></div>:externalReview.status==="approved"?<div className="external-review-result"><span className="external-review-result-icon approved"><CheckCircle2 size={26}/></span><h2 id="external-review-title">Transfer approved</h2><p>Your request has been approved and the amount has been debited from your Nexora account.</p><small>External bank payment execution is not connected.</small><button type="button" onClick={()=>setExternalReview(null)}>Close</button></div>:<div className="external-review-result"><span className="external-review-result-icon declined"><ShieldCheck size={26}/></span><h2 id="external-review-title">Transfer declined</h2><p>Your request was declined. No amount was debited from your account.</p><div className="external-review-reason"><strong>Reason</strong><span>{externalReview.reason||"No reason was provided."}</span></div><button type="button" onClick={()=>setExternalReview(null)}>Close</button></div>}
    <div className="external-review-reference">Reference: {externalReview.reference}</div>
   </div>
  </div>}
 </section>);
}
