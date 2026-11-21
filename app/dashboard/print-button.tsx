"use client";

import { Printer } from "lucide-react";

export default function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return <button type="button" className="workspace-download print-action" onClick={() => window.print()}>
    <Printer size={14} /> {label}
  </button>;
}
