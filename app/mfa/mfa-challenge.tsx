"use client";
import {useEffect,useState} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {ShieldCheck} from "lucide-react";
export function MfaChallenge(){
 const router=useRouter();const params=useSearchParams();
 const [factorId,setFactorId]=useState("");const [code,setCode]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 const supabase=createClient();
 useEffect(()=>{void (async()=>{const {data,error}=await supabase.auth.mfa.listFactors();if(error){setError(error.message);return;}const factor=data.totp.find(x=>x.status==="verified");if(factor)setFactorId(factor.id);else setError("No verified authenticator factor was found. Contact support.");})();},[]);
 async function submit(e:React.FormEvent){e.preventDefault();if(!factorId)return;setBusy(true);setError("");const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId});if(challengeError){setBusy(false);setError(challengeError.message);return;}const {error}=await supabase.auth.mfa.verify({factorId,challengeId:challenge.id,code});setBusy(false);if(error){setError(error.message);return;}const next=params.get("next")||"/dashboard";router.replace(next.startsWith("/")&&!next.startsWith("//")?next:"/dashboard");router.refresh();}
 return <main className="mfa-challenge-shell"><form className="mfa-challenge-card" onSubmit={submit}><span className="mfa-challenge-icon"><ShieldCheck size={25}/></span><span className="workspace-kicker">NEXORA BANK · EXTRA SECURITY</span><h1>Verify it’s you</h1><p>Enter the six-digit code from your authenticator app to continue.</p><label>Authenticator code<input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required/></label>{error&&<p className="mfa-message" role="alert">{error}</p>}<button disabled={busy||!factorId||code.length!==6}>{busy?"Verifying…":"Verify and continue"}</button></form></main>;
}
