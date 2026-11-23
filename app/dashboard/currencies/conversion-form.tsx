"use client";
import {useMemo,useState} from "react";
import {convertCurrency} from "./actions";
type Account={account_id:string;currency:string;account_name:string;account_number:string;balance_minor:number};
export function ConversionForm({accounts}:{accounts:Account[]}){
 const currencies=useMemo(()=>[...new Set(accounts.map(a=>a.currency))].sort(),[accounts]);
 const [fromCurrency,setFromCurrency]=useState(accounts[0]?.currency||"");
 const [toCurrency,setToCurrency]=useState(accounts.find(a=>a.currency!==accounts[0]?.currency)?.currency||"");
 const sourceAccounts=accounts.filter(a=>a.currency===fromCurrency);
 const destinationAccounts=accounts.filter(a=>a.currency===toCurrency);
 const [from,setFrom]=useState(sourceAccounts[0]?.account_id||"");
 const [to,setTo]=useState(destinationAccounts[0]?.account_id||"");
 const [amount,setAmount]=useState("");
 const [quote,setQuote]=useState<{quoteId:string;rate:number;expiresAt:string;source:string;providerUpdatedAt?:string}|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const source=sourceAccounts.find(a=>a.account_id===from)||sourceAccounts[0];
 const destination=destinationAccounts.find(a=>a.account_id===to)||destinationAccounts[0];
 function changeFromCurrency(value:string){const nextTo=toCurrency===value?(currencies.find(c=>c!==value)||""):toCurrency;setFromCurrency(value);setFrom(accounts.find(a=>a.currency===value)?.account_id||"");if(nextTo!==toCurrency){setToCurrency(nextTo);setTo(accounts.find(a=>a.currency===nextTo)?.account_id||"");}setQuote(null);setError("");}
 function changeToCurrency(value:string){setToCurrency(value);setTo(accounts.find(a=>a.currency===value)?.account_id||"");setQuote(null);setError("");}
 async function getQuote(){
  if(!source||!destination||source.currency===destination.currency){setError("Choose two different currencies with active accounts.");return;}
  setBusy(true);setError("");setQuote(null);
  try{const r=await fetch("/api/fx/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({base:source.currency,quote:destination.currency})});const data=await r.json();if(!r.ok)throw new Error(data.error||"Could not get an exchange quote.");setQuote(data);}
  catch(e){setError(e instanceof Error?e.message:"Could not get exchange quote.");}
  finally{setBusy(false);}
 }
 return <section className="workspace-panel currency-conversion-panel">
  <div className="workspace-panel-heading"><div><span className="workspace-kicker">CURRENCY EXCHANGE</span><h2>Convert between currencies</h2><p>Select the currency you are converting FROM and the currency you want to receive. You need an active Nexora account in each currency.</p></div></div>
  <form action={convertCurrency} className="transfer-form">
   <label>From currency<select value={fromCurrency} onChange={e=>changeFromCurrency(e.target.value)} required>{currencies.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
   {sourceAccounts.length>1&&<label>Debit account<select value={source?.account_id||""} onChange={e=>{setFrom(e.target.value);setQuote(null);}}>{sourceAccounts.map(a=><option key={a.account_id} value={a.account_id}>{a.account_name} · {a.account_number}</option>)}</select></label>}
   <label>To currency<select value={toCurrency} onChange={e=>changeToCurrency(e.target.value)} required>{currencies.filter(c=>c!==fromCurrency).map(c=><option key={c} value={c}>{c}</option>)}</select></label>
   {destinationAccounts.length>1&&<label>Credit account<select value={destination?.account_id||""} onChange={e=>{setTo(e.target.value);setQuote(null);}}>{destinationAccounts.map(a=><option key={a.account_id} value={a.account_id}>{a.account_name} · {a.account_number}</option>)}</select></label>}
   <input type="hidden" name="from_account" value={source?.account_id||""}/>
   <input type="hidden" name="to_account" value={destination?.account_id||""}/>
   <label>Amount to convert ({fromCurrency})<input name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);setQuote(null);}} required/><small>This amount is deducted from your {fromCurrency} account.</small></label>
   <button type="button" disabled={busy||!source||!destination||fromCurrency===toCurrency} onClick={()=>void getQuote()}>{busy?"Getting rate…":"Get exchange rate"}</button>
   {quote&&<div className="fx-quote"><strong>1 {source?.currency} = {quote.rate.toFixed(6)} {destination?.currency}</strong>{amount&&Number(amount)>0&&<strong>Estimated receive: {new Intl.NumberFormat(undefined,{style:"currency",currency:destination?.currency||"USD"}).format(Number(amount)*quote.rate)}</strong>}<span>Rate source: {quote.source} · Provider updated: {quote.providerUpdatedAt||"not supplied"} · Expires {new Date(quote.expiresAt).toLocaleTimeString()}</span><small>Indicative reference rate. Provider rates may be delayed. No conversion fee is currently applied. After confirmation, the source account is debited and the destination account is credited through paired ledger entries. This is an internal account conversion, not an external bank payment.</small><input type="hidden" name="quote_id" value={quote.quoteId}/></div>}
   <label>Transaction PIN<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required/></label>
   <button type="submit" disabled={!quote||busy||!source||!destination}>Confirm conversion with transaction PIN</button>
  </form>
  {error&&<p className="mfa-message" role="alert">{error}</p>}
  {currencies.length<2&&<p className="workspace-disclaimer">Open another currency account above before converting. You can only convert between currencies for which you have active Nexora accounts.</p>}
 </section>;
}
