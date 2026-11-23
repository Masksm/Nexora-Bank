"use client";

import {useState} from "react";
import {CheckCircle2, X, XCircle} from "lucide-react";

export function ExternalTransferDecisionDialog({decision,reference}:{decision:"approve"|"reject";reference:string}) {
  const [open,setOpen]=useState(true);
  if(!open)return null;
  const approved=decision==="approve";
  return <div className="external-test-result-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
    <section className="external-test-result-dialog" role="dialog" aria-modal="true" aria-labelledby="external-test-result-title">
      <button type="button" className="external-test-result-close" onClick={()=>setOpen(false)} aria-label="Close"><X size={18}/></button>
      <span className={approved?"external-test-result-icon approved":"external-test-result-icon rejected"}>{approved?<CheckCircle2 size={25}/>:<XCircle size={25}/>}</span>
      <span className="external-test-result-kicker">ADMIN REVIEW RESULT · {reference}</span>
      <h2 id="external-test-result-title">{approved?"Test transfer approved":"Test transfer rejected"}</h2>
      <p>{approved
        ?"This is a simulated test transfer. The approval has updated the request status inside Nexora only. No external bank was contacted, no payment was transmitted, and no funds were sent."
        :"This simulated transfer request was rejected inside Nexora. No external bank was contacted and no payment was attempted."}</p>
      <div className="external-test-result-note">TEST WORKFLOW ONLY</div>
      <button type="button" onClick={()=>setOpen(false)}>Close review result</button>
    </section>
  </div>;
}
