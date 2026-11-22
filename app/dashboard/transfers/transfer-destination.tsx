"use client";
import Link from "next/link";
import { useMemo,useState } from "react";
import { ArrowUpRight,Globe2,Landmark,ShieldCheck,Wallet,PlusCircle,LockKeyhole } from "lucide-react";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { submitTransferWithPin } from "./secure-actions";
import { bankDirectory } from "@/lib/bank-directory";
type Account={account_id:string;account_number:string;account_name:string;status:string;balance_minor:number;currency:string};
type Beneficiary={id:string;beneficiary_name:string;bank_name:string;country_code:string;account_number:string|null;routing_number:string|null;sort_code:string|null;iban:string|null;bic:string|null;verification_status:string};
const countries=[["US","United States"],["GB","United Kingdom"],["DE","Germany"],["FR","France"],["NL","Netherlands"],["ES","Spain"],["IE","Ireland"],["AT","Austria"],["BE","Belgium"],["CH","Switzerland"],["PT","Portugal"],["IT","Italy"],["SE","Sweden"]];
function money(minor:number,locale:SupportedLocale,currency:string){return new Intl.NumberFormat(locale,{style:"currency",currency}).format(minor/100);}
export function TransferDestination({accounts,beneficiaries,locale}:{accounts:Account[];beneficiaries:Beneficiary[];locale:SupportedLocale}){
 const [mode,setMode]=useState<"internal"|"international">("internal"),[country,setCountry]=useState("US"),[beneficiaryId,setBeneficiaryId]=useState(""),[sourceId,setSourceId]=useState(accounts.find(a=>a.status==="active")?.account_id??accounts[0]?.account_id??""),[bankName,setBankName]=useState("");
 const t=(value:string)=>pageText(locale,value),active=accounts.filter(a=>a.status==="active");
 const countryRecipients=useMemo(()=>beneficiaries.filter(b=>b.country_code===country),[beneficiaries,country]);
 const bankOptions=useMemo(()=>bankDirectory.filter(bank=>bank.country===country),[country]);
 const chosen=countryRecipients.find(b=>b.id===beneficiaryId)??null;
 function changeCountry(value:string){setCountry(value);setBeneficiaryId("");setBankName("");}
 return <section className="workspace-panel transfer-destination-panel">
  <div className="transfer-mode-switch" role="tablist" aria-label={t("Transfer type")}>
   <button type="button" role="tab" aria-selected={mode==="internal"} className={mode==="internal"?"active":""} onClick={()=>setMode("internal")}><Wallet size={16}/><span><strong>{t("Internal transfer")}</strong><small>{t("Send to another Nexora account")}</small></span></button>
   <button type="button" role="tab" aria-selected={mode==="international"} className={mode==="international"?"active":""} onClick={()=>setMode("international")}><Globe2 size={16}/><span><strong>{t("International transfer")}</strong><small>{t("Send to a bank in another country")}</small></span></button>
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
   <div className="international-transfer-heading"><span className="international-transfer-icon"><Globe2 size={22}/></span><div><span className="workspace-kicker">{t("GLOBAL PAYMENTS")}</span><h2>{t("International bank transfer")}</h2><p>{t("Choose a destination country and one of your saved bank recipients.")}</p></div></div>
   <div className="international-transfer-grid">
    <label>{t("Pay from")}<select value={sourceId} onChange={e=>setSourceId(e.target.value)} disabled={!active.length}><option value="">{t("Select a source account")}</option>{active.map(a=><option key={a.account_id} value={a.account_id}>{a.account_name} · {a.account_number} · {money(Number(a.balance_minor),locale,a.currency)}</option>)}</select></label>
    <label>{t("Destination country")}<select value={country} onChange={e=>changeCountry(e.target.value)}>{countries.map(([code,name])=><option key={code} value={code}>{t(name)}</option>)}</select></label>
    <label>{t("Bank")}<select value={bankName} onChange={e=>{setBankName(e.target.value);setBeneficiaryId("");}}><option value="">{t("Select bank")}</option>{bankOptions.map(bank=><option key={bank.name} value={bank.name}>{bank.name}</option>)}</select></label><label className="international-recipient-select">{t("Bank and recipient")}<select value={beneficiaryId} onChange={e=>{const id=e.target.value;setBeneficiaryId(id);const match=countryRecipients.find(item=>item.id===id);if(match)setBankName(match.bank_name);}}><option value="">{t("Select a saved bank recipient")}</option>{countryRecipients.filter(b=>!bankName||b.bank_name===bankName).map(b=><option key={b.id} value={b.id}>{b.bank_name} · {b.beneficiary_name}</option>)}</select></label>
   </div>
   {chosen?<div className="international-recipient-card"><div className="international-recipient-card-head"><span><Landmark size={17}/>{chosen.bank_name}</span><span className={chosen.verification_status==="verified"?"recipient-verified":"recipient-unverified"}>{chosen.verification_status==="verified"?<ShieldCheck size={13}/>:<LockKeyhole size={13}/>} {t(chosen.verification_status==="verified"?"Name verified by provider":"Name not independently verified")}</span></div><h3>{chosen.beneficiary_name}</h3><p>{t(countries.find(([code])=>code===chosen.country_code)?.[1]??chosen.country_code)}</p><dl>{chosen.iban&&<div><dt>IBAN</dt><dd>{chosen.iban.slice(0,4)}••••••••{chosen.iban.slice(-4)}</dd></div>}{chosen.account_number&&<div><dt>{chosen.country_code==="US"?"Account number":chosen.country_code==="GB"?"Account number":"Account"}</dt><dd>••••{chosen.account_number.slice(-4)}</dd></div>}{chosen.routing_number&&<div><dt>ABA routing</dt><dd>{chosen.routing_number}</dd></div>}{chosen.sort_code&&<div><dt>Sort code</dt><dd>{chosen.sort_code}</dd></div>}{chosen.bic&&<div><dt>BIC / SWIFT</dt><dd>{chosen.bic}</dd></div>}</dl><Link href="/dashboard/beneficiaries">{t("Manage or verify this recipient")} <ArrowUpRight size={14}/></Link></div>:<div className="international-recipient-empty"><Landmark size={24}/><strong>{countryRecipients.length?t("Choose a saved recipient to see its bank details"):t("No saved recipients for this country yet")}</strong><p>{t("Add an international bank recipient first. Bank directories can identify a bank, but only a supported verification provider can confirm the account-holder name.")}</p><Link href="/dashboard/beneficiaries"><PlusCircle size={15}/>{t("Add an international recipient")}</Link></div>}
   <div className="international-transfer-notice"><ShieldCheck size={18}/><div><strong>{t("International transfer setup")}</strong><p>{t("International bank details and recipient verification are available, but an external payment execution partner is not connected. This form will not debit your account or send money yet.")}</p></div></div>
   <div className="international-transfer-actions"><label>{t("Transfer amount (USD)")}<input type="number" min="0.01" step="0.01" placeholder="250.00" disabled/></label><button type="button" disabled>{t("International transfers not enabled yet")}</button></div>
  </div>}
 </section>;
}
