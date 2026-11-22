import {Suspense} from "react";
import {MfaChallenge} from "./mfa-challenge";
export const dynamic="force-dynamic";
export default function MfaPage(){return <Suspense fallback={<main className="mfa-challenge-shell">Loading secure verification…</main>}><MfaChallenge/></Suspense>;}
