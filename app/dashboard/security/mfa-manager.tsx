"use client";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {ShieldCheck,Smartphone,LockKeyhole} from "lucide-react";

type Factor={id:string,friendly_name?:string,status:string,factor_type:string};
export function MfaManager(){
 const [factors,setFactors]=useState<Factor[]>([]);
 const [qr,setQr]=useState(""); const [secret,setSecret]=useState("");
 const [factorId,setFactorId]=useState(""); const [challengeId,setChallengeId]=useState("");
 const [code,setCode]=useState(""); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
 const supabase=createClient();
 async function refresh(){const {data,error}=await supabase.auth.mfa.listFactors();if(error){setMessage(error.message);return;}setFactors((data?.totp??[]) as Factor[]);}
 useEffect(()=>{void refresh();},[]);
 async function enroll(){
  setBusy(true);setMessage("");
  const {data,error}=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:"Nexora authenticator"});
  setBusy(false);
  if(error){setMessage(error.message);return;}
  setFactorId(data.id);setQr(data.totp.qr_code);setSecret(data.totp.secret);
  setMessage("Scan the QR code with an authenticator app, then enter its six-digit code.");
 }
 async function verify(){
  if(!factorId||!code.trim())return;
  setBusy(true);
  const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId});
  if(challengeError){setBusy(false);setMessage(challengeError.message);void supabase.rpc("record_operations_event",{p_severity:"warning",p_category:"authentication",p_service:"MFA enrollment",p_operation:"challenge_failed",p_error_code:"MFA_CHALLENGE_FAILED",p_request_path:"/dashboard/security"});return;}
  setChallengeId(challenge.id);
  const {error}=await supabase.auth.mfa.verify({factorId,challengeId:challenge.id,code:code.trim()});
  setBusy(false);
  if(error){setMessage(error.message);void supabase.rpc("record_operations_event",{p_severity:"warning",p_category:"authentication",p_service:"MFA enrollment",p_operation:"verification_failed",p_error_code:"MFA_VERIFY_FAILED",p_request_path:"/dashboard/security"});return;}
  setQr("");setSecret("");setFactorId("");setChallengeId("");setCode("");setMessage("Authenticator MFA is now enabled for this account.");await refresh();
 }
 async function remove(id:string){
  setBusy(true);const {error}=await supabase.auth.mfa.unenroll({factorId:id});setBusy(false);
  setMessage(error?error.message:"Authenticator factor removed.");await refresh();
 }
 const verified=factors.filter(f=>f.status==="verified");
 return <div className="mfa-manager">
  <div className="mfa-status"><ShieldCheck size={20}/><div><strong>Authenticator app</strong><span>{verified.length?"MFA is enabled. Protected pages require a second factor.":"Add an authenticator app for an extra sign-in check."}</span></div><b>{verified.length?"Enabled":"Not enabled"}</b></div>
  {verified.map(f=><div className="mfa-factor" key={f.id}><Smartphone size={17}/><span>{f.friendly_name||"Authenticator app"}</span><button type="button" disabled={busy} onClick={()=>void remove(f.id)}>Remove</button></div>)}
  {qr&&<div className="mfa-enrollment"><img src={qr} alt="Authenticator enrollment QR code"/><p>Or enter this setup key manually:</p><code>{secret}</code><label>Six-digit authenticator code<input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6}/></label><button type="button" disabled={busy||code.length!==6} onClick={()=>void verify()}>Verify and enable MFA</button></div>}
  {!qr&&verified.length===0&&<button type="button" className="mfa-enroll-button" disabled={busy} onClick={()=>void enroll()}><LockKeyhole size={16}/> Set up authenticator MFA</button>}
  {message&&<p className="mfa-message" role="status">{message}</p>}
 </div>;
}
