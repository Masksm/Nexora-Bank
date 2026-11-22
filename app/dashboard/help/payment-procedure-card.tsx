"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { acknowledgePaymentProcedure } from "./actions";

type Procedure = {
  id:string; cryptocurrency:string; network:string; wallet_address:string;
  expected_amount:string|number; amount_currency:string; payment_reference:string;
  purpose:string; status:string; customer_acknowledged_at:string|null;
  created_at:string; cancellation_reason:string|null;
};
export function PaymentProcedureCard({procedure,conversationId}:{procedure:Procedure;conversationId:string}) {
  const [copied,setCopied]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [uploadError,setUploadError]=useState("");
  const [uploadSuccess,setUploadSuccess]=useState("");
  const router=useRouter();
  async function copyAddress(){
    try{await navigator.clipboard.writeText(procedure.wallet_address);setCopied(true);window.setTimeout(()=>setCopied(false),1800);}
    catch{setCopied(false);}
  }
  async function uploadReceipt(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];
    if(!file)return;
    setUploadError("");setUploadSuccess("");
    const allowed=["image/jpeg","image/png","image/webp","application/pdf"];
    if(!allowed.includes(file.type)){setUploadError("Upload a JPG, PNG, WebP image or PDF.");event.target.value="";return;}
    if(file.size>10*1024*1024){setUploadError("The receipt must be 10 MB or smaller.");event.target.value="";return;}
    setUploading(true);
    try{
      const supabase=createClient();
      const {data:{user},error:userError}=await supabase.auth.getUser();
      if(userError||!user)throw new Error("Your session has expired. Sign in again.");
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100);
      const path=user.id+"/"+procedure.id+"/"+crypto.randomUUID()+"-"+safeName;
      const {error:uploadError}=await supabase.storage.from("payment-receipts").upload(path,file,{contentType:file.type,upsert:false});
      if(uploadError)throw uploadError;
      const {error:insertError}=await supabase.from("support_payment_receipts").insert({
        procedure_id:procedure.id,conversation_id:conversationId,customer_user_id:user.id,
        storage_path:path,original_filename:file.name.slice(0,255),mime_type:file.type,file_size_bytes:file.size
      });
      if(insertError){
        await supabase.storage.from("payment-receipts").remove([path]);
        throw insertError;
      }
      setUploadSuccess("Receipt received and added to the payment audit record.");
      router.refresh();
    }catch(error){
      setUploadError(error instanceof Error?error.message:"Receipt upload failed. Try again.");
    }finally{setUploading(false);event.target.value="";}
  }
  return <article className="support-payment-card">
    <div className="support-payment-heading"><span>PAYMENT INSTRUCTION</span><strong>{procedure.status.replaceAll("_"," ")}</strong></div>
    <p>{procedure.status==="cancelled"?"This payment instruction has been cancelled. Do not send funds to the address below.":"Review the payment details carefully. Only send the exact asset over the selected network."}</p>
    <dl><div><dt>Cryptocurrency</dt><dd>{procedure.cryptocurrency}</dd></div><div><dt>Network</dt><dd>{procedure.network}</dd></div><div><dt>Expected amount</dt><dd>{String(procedure.expected_amount)} {procedure.amount_currency}</dd></div><div><dt>Payment reference</dt><dd>{procedure.payment_reference}</dd></div><div><dt>Purpose</dt><dd>{procedure.purpose}</dd></div></dl>
    <div className="support-payment-address"><span>Receiving wallet address</span><code>{procedure.wallet_address}</code><button type="button" onClick={copyAddress} disabled={procedure.status==="cancelled"}>{copied?"Copied":"Copy address"}</button></div>
    <div className="support-payment-warning">Security notice: Nexora staff will never ask for your password, one-time codes, private keys or recovery phrase. Never share them.</div>
    {procedure.status==="awaiting_payment"&&<form action={acknowledgePaymentProcedure}><input type="hidden" name="procedure_id" value={procedure.id}/><input type="hidden" name="conversation_id" value={conversationId}/><button type="submit" disabled={Boolean(procedure.customer_acknowledged_at)}>{procedure.customer_acknowledged_at?"Details acknowledged":"I have read and understood these details"}</button></form>}
    {procedure.status==="awaiting_payment"&&<div className="support-receipt-upload"><label>Upload payment receipt or transaction screenshot<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={uploadReceipt} disabled={uploading}/></label><small>JPG, PNG, WebP or PDF · Maximum 10 MB. A receipt is evidence for review, not automatic proof of blockchain settlement.</small>{uploading&&<span>Uploading receipt…</span>}{uploadSuccess&&<span role="status">{uploadSuccess}</span>}{uploadError&&<span role="alert">{uploadError}</span>}</div>}
    {procedure.status==="cancelled"&&procedure.cancellation_reason&&<small>Cancellation reason: {procedure.cancellation_reason}</small>}
    <small>Issued {new Date(procedure.created_at).toLocaleString()}</small>
  </article>;
}
