import { createClient } from "@/lib/supabase/server";

function csvCell(value: string | number | boolean | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"','""')}"`;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: accounts, error: accountError } = await supabase
    .from("bank_accounts").select("id").eq("user_id", user.id);
  if (accountError) return new Response("Unable to load accounts", { status: 500 });
  const accountIds = (accounts ?? []).map((account) => account.id);
  if (!accountIds.length) {
    return new Response("Date,Description,Reference,Type,Status,Amount,Currency,Synthetic demo\n", {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="nexora-statement.csv"', "Cache-Control": "no-store" },
    });
  }

  const { data: entries, error: entryError } = await supabase
    .from("ledger_entries")
    .select("transaction_id,account_id,amount_minor,currency,created_at")
    .in("account_id", accountIds)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (entryError) return new Response("Unable to load ledger entries", { status: 500 });
  const transactionIds = [...new Set((entries ?? []).map((entry) => entry.transaction_id))];
  const { data: transactions, error: transactionError } = transactionIds.length
    ? await supabase.from("ledger_transactions")
        .select("id,reference,transaction_type,status,description,metadata,created_at")
        .in("id", transactionIds)
    : { data: [], error: null };
  if (transactionError) return new Response("Unable to load transactions", { status: 500 });

  const txMap = new Map((transactions ?? []).map((transaction) => [transaction.id, transaction]));
  const totals = new Map<string, { amount: number; currency: string }>();
  for (const entry of entries ?? []) {
    const current = totals.get(entry.transaction_id) ?? { amount: 0, currency: entry.currency };
    current.amount += Number(entry.amount_minor);
    totals.set(entry.transaction_id, current);
  }

  const rows = [
    ["Date","Description","Reference","Type","Status","Amount","Currency","Synthetic demo"],
    ...(transactions ?? []).map((transaction) => {
      const amount = totals.get(transaction.id);
      const metadata = transaction.metadata as { synthetic_demo?: boolean; review_required?: boolean } | null;
      const status = metadata?.review_required ? "under_review" : transaction.status;
      return [
        new Date(transaction.created_at).toISOString(),
        transaction.description || transaction.transaction_type,
        transaction.reference,
        transaction.transaction_type,
        status,
        ((amount?.amount ?? 0) / 100).toFixed(2),
        amount?.currency ?? "USD",
        metadata?.synthetic_demo ? "yes" : "no",
      ];
    }),
  ];
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0,10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexora-activity-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
