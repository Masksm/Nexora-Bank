"use client";
import {useState, type ReactNode} from "react";
import {X,ChevronRight} from "lucide-react";

export function SecuritySectionDialog({kicker,title,description,children}:{kicker:string;title:string;description:string;children:ReactNode}){
 const [open,setOpen]=useState(false);
 return <>
  <button type="button" className="security-dialog-trigger" onClick={()=>setOpen(true)} aria-haspopup="dialog">
   <span>{kicker}</span><strong>{title}</strong><small>{description}</small><i><ChevronRight size={17}/></i>
  </button>
  {open&&<div className="security-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
   <div className="security-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event=>{if(event.key==="Escape")setOpen(false);}}>
    <button type="button" className="security-dialog-close" onClick={()=>setOpen(false)} aria-label="Close section"><X size={18}/></button>
    {children}
   </div>
  </div>}
 </>;
}
