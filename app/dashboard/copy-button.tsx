"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";

export function CopyButton({value,locale}:{value:string;locale:SupportedLocale}){
  const t=(value:string)=>pageText(locale,value);
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
  return <button type="button" onClick={copy} aria-label={copied?t("Copied account number"):t("Copy account number")} title={copied?t("Copied"):t("Copy account number")}>{copied?<Check size={15}/>:<Copy size={15}/>}</button>;
}
