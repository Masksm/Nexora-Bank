"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({value}:{value:string}){
  const [copied,setCopied]=useState(false);
  async function copy(){
    try{
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(()=>setCopied(false),1600);
    }catch{
      setCopied(false);
    }
  }
  return <button type="button" onClick={copy} aria-label={copied?"Copied account number":"Copy account number"} title={copied?"Copied":"Copy account number"}>{copied?<Check size={15}/>:<Copy size={15}/>}</button>;
}
