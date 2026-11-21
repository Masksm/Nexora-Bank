"use client";

import { useState } from "react";
import { createScheduledTransfer } from "./actions";

type Account = { account_id: string; account_number: string; nickname: string | null; account_name: string; balance_minor: number };

export default function ScheduleTransferForm({ accounts }: { accounts: Account[] }) {
  const [localDate, setLocalDate] = useState("");
  const [utcDate, setUtcDate] = useState("");
  const minDate = new Date(Date.now() + 5 * 60 * 1000);
  const minValue = new Date(minDate.getTime() - minDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return (
    <form action={createScheduledTransfer} className="transfer-form">
      <label>Pay from
        <select name="account_id" required>
          {accounts.map((account) => <option key={account.account_id} value={account.account_id}>
            {(account.nickname || account.account_name)} · {account.account_number} · ${(Number(account.balance_minor) / 100).toFixed(2)}
          </option>)}
        </select>
      </label>
      <label>Recipient account number
        <input name="recipient" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="10-digit Nexora account number" required />
      </label>
      <label>Amount (USD)
        <input name="amount" type="number" min="0.01" step="0.01" placeholder="250.00" required />
      </label>
      <label>Schedule date and time
        <input type="datetime-local" min={minValue} value={localDate} onChange={(event) => {
          setLocalDate(event.target.value);
          setUtcDate(event.target.value ? new Date(event.target.value).toISOString() : "");
        }} required />
      </label>
      <input type="hidden" name="scheduled_for_utc" value={utcDate} />
      <label>Repeat
        <select name="frequency" defaultValue="once">
          <option value="once">One time</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
      <label>Description (optional)
        <input name="description" maxLength={160} placeholder="What is this transfer for?" />
      </label>
      <button type="submit" disabled={!utcDate}>Save scheduled transfer</button>
      <p>When due, the transfer is submitted to security review. It will not affect either balance until an administrator approves it.</p>
    </form>
  );
}
