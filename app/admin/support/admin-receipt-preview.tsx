"use client";
import { useState } from "react";
import { Eye, X, ExternalLink } from "lucide-react";
export function AdminReceiptPreview({url,filename,mimeType}:{url:string;filename:string;mimeType:string}) {
 const [open,setOpen]=useState(false);
 return <><button type="button" className="admin-receipt-preview-trigger" onClick={()=>setOpen(true)}><Eye size={14}/> View receipt</button>{open&&<div className="admin-receipt-preview-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}}><section className="admin-receipt-preview-modal" role="dialog" aria-modal="true" aria-labelledby="admin-receipt-preview-title"><header><div><span>PAYMENT EVIDENCE</span><h2 id="admin-receipt-preview-title">{filename}</h2></div><button type="button" onClick={()=>setOpen(false)} aria-label="Close"><X size={20}/></button></header><div className="admin-receipt-preview-content">{mimeType==="application/pdf"?<iframe title={filename} src={url}/>:<img src={url} alt={filename}/>}</div><footer><a href={url} target="_blank" rel="noreferrer">Open original file <ExternalLink size={13}/></a><button type="button" onClick={()=>setOpen(false)}>Close preview</button></footer></section></div>}</>;
}
