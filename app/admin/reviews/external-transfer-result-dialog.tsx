"use client";

import {useState} from "react";
import {CheckCircle2, X, XCircle} from "lucide-react";

export function ExternalTransferDecisionDialog({decision,reference}:{decision:"approve"|"reject";reference:string}) {
  const [open,setOpen]=useState(true);
  if(!open)return null;
  const approved=decision==="approve";
  return <div className="external-transfer-result-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
    <section className="external-transfer-result-dialog" role="dialog" aria-modal="true" aria-labelledby="external-transfer-result-title">
      <button type="button" className="external-transfer-result-close" onClick={()=>setOpen(false)} aria-label="Close"><X size={18}/></button>
      <span className={approved?"external-transfer-result-icon approved":"external-transfer-result-icon rejected"}>{approved?<CheckCircle2 size={25}/>:<XCircle size={25}/>}</span>
      <span className="external-transfer-result-kicker">ADMIN REVIEW RESULT · {reference}</span>
      <h2 id="external-transfer-result-title">{approved?"International transfer approved":"International transfer rejected"}</h2>
      <p>{approved
        ?"The customer’s Nexora account has been debited and the transaction has been posted to the internal ledger. No external bank was contacted and no external payment was transmitted."
        :"The request was rejected. No amount was debited from the customer’s account and no external payment was attempted."}</p>
      
      <button type="button" onClick={()=>setOpen(false)}>Close review result</button>
    </section>
  </div>;
}
