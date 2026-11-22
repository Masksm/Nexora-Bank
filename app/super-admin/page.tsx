import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { SupportedLocale } from "@/lib/locale";
import { pageText } from "@/lib/page-translations";
import { Activity, Eye, LogOut, ShieldCheck, Users, UserCog, MessageSquare, LockKeyhole, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { superAdminSetAssignment, superAdminSetRole } from "./actions";
import { DeleteAccountForm } from "./delete-account-form";
import { SuperAdminDialog } from "./section-dialog";

export const dynamic = "force-dynamic";
type DirectoryUser = { user_id: string; email: string; role: string; display_name: string; account_count: number; assigned_customer_count: number };
type Assignment = { id: string; admin_user_id: string; customer_user_id: string; created_at: string };
type Props = { searchParams: Promise<{ kind?: string; message?: string; ticket?: string }> };

export default async function SuperAdminPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const meta = claims?.claims?.app_metadata as { role?: string } | undefined;
  if (!user || claimsError || meta?.role !== "super_admin") redirect("/login");

  const params = await searchParams;
  const [{ data: directory, error: directoryError }, { data: assignments }, { data: tickets, error: ticketError }, { data: paymentProcedures, error: paymentError }, { data: paymentAudit, error: paymentAuditError }] = await Promise.all([
    supabase.rpc("super_admin_directory"),
    supabase.from("admin_customer_assignments").select("id,admin_user_id,customer_user_id,created_at").order("created_at", { ascending: false }),
    supabase.from("support_conversations").select("id,user_id,subject,category,status,created_at,updated_at").order("updated_at", { ascending: false }).limit(100),\n    supabase.from("support_payment_procedures").select("id,conversation_id,customer_user_id,created_by,cryptocurrency,network,wallet_address,expected_amount,amount_currency,payment_reference,purpose,status,customer_acknowledged_at,cancelled_at,cancellation_reason,created_at,updated_at").order("created_at",{ascending:false}).limit(100),\n    supabase.from("support_payment_procedure_audit").select("id,procedure_id,actor_user_id,actor_role,action,details,created_at").order("created_at",{ascending:false}).limit(250),
  ]);
  const people = (directory ?? []) as DirectoryUser[];
  const links = (assignments ?? []) as Assignment[];
  const admins = people.filter((person) => person.role === "admin");
  const customers = people.filter((person) => !["admin", "super_admin"].includes(person.role));
  const deletableUsers = people.filter((person) => person.role !== "super_admin");
  const selected = (tickets ?? []).find((ticket) => ticket.id === params.ticket) ?? (tickets ?? [])[0];
  const { data: messages } = selected
    ? await supabase.from("support_messages").select("id,sender_user_id,sender_role,body,created_at").eq("conversation_id", selected.id).order("created_at").limit(250)
    : { data: [] };
  const personMap = new Map(people.map((person) => [person.user_id, person]));
  const staffCount = admins.length;
  const assignmentCount = links.length;
  const openCount = (tickets ?? []).filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length;
  const locale = ((await cookies()).get("nexora_locale")?.value || "en") as SupportedLocale;
  const t = (value: string) => pageText(locale, value);

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/super-admin"><span>N</span>{t("NEXORA")} <i>{t("SUPER ADMIN")}</i></Link>
        <div className="admin-side-label">{t("EXECUTIVE CONTROL")}</div>
        <nav>
          <Link className="selected" href="/super-admin"><Activity size={16}/> {t("Overview")}</Link>
          <a href="#staff"><UserCog size={16}/> {t("Staff administrators")}</a>
          <a href="#assignments"><Users size={16}/> {t("Customer access")}</a>
          <a href="#promote"><UserCog size={16}/> {t("Role management")}</a>
          <a href="#oversight"><Eye size={16}/> {t("Support oversight")}</a>\n          <a href="#payment-audit"><ShieldCheck size={16}/> Crypto payment audit</a>          <a href="#accounts"><Trash2 size={16}/> {t("Account management")}</a>
          <Link href="/admin"><LockKeyhole size={16}/> {t("Legacy admin operations")}</Link>
        </nav>
        <div className="admin-sidebar-foot"><ShieldCheck size={16}/><span>{t("Super Admin session")}</span><form action={signOut}><button className="admin-logout-button" type="submit"><LogOut size={15}/> {t("Sign out")}</button></form></div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar"><div><span>{t("EXECUTIVE ADMINISTRATION / GLOBAL CONTROL")}</span><h1>{t("Super Admin command centre")}</h1></div><span className="admin-status active">{t("Highest access level")}</span></header>
        <div className="admin-welcome"><div><span>{t("GLOBAL OVERSIGHT")}</span><h2>{t("Administrator governance")}</h2><p>{t("Manage staff authority, customer ownership and support visibility across Nexora.")}</p></div><div className="admin-identity"><ShieldCheck size={18}/><span>{user.email}<small>{t("Super Administrator")}</small></span></div></div>
        {params.message && <div className={params.kind === "error" ? "admin-alert error" : "admin-alert success"} role="status">{params.message}</div>}
        <section className="admin-stats">
          <article><span><Users size={17}/> {t("CUSTOMER ACCOUNTS")}</span><strong>{customers.length}</strong><small>{t("All registered non-admin accounts")}</small></article>
          <article><span><UserCog size={17}/> {t("STAFF ADMINS")}</span><strong>{staffCount}</strong><small>{t("Restricted administrator accounts")}</small></article>
          <article><span><LockKeyhole size={17}/> {t("ACTIVE ASSIGNMENTS")}</span><strong>{assignmentCount}</strong><small>{t("Customer-to-admin access links")}</small></article>
        </section>

        <SuperAdminDialog locale={locale} title={t("Staff administrators")} eyebrow={t("STAFF AUTHORITY")} description={t("Review staff administrator accounts and manage their access.")} count={staffCount} id="staff" icon={<UserCog size={20}/>}>
          <div className="admin-panel-heading"><div><span>{t("STAFF AUTHORITY")}</span><h2>{t("Staff administrator accounts")}</h2></div><span>{staffCount} staff</span></div>
          {directoryError ? <p className="admin-empty">Unable to load the administrator directory: {directoryError.message}</p> : !admins.length ? <p className="admin-empty">{t("No staff administrators have been appointed yet.")}</p> :
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("Staff administrator")}</th><th>{t("Assigned customers")}</th><th>{t("Access")}</th></tr></thead><tbody>
              {admins.map((person) => <tr key={person.user_id}><td><strong>{person.display_name}</strong><small>{person.email} · {person.user_id.slice(0, 10)}…</small></td><td>{person.assigned_customer_count}</td><td><form action={superAdminSetRole}><input type="hidden" name="user_id" value={person.user_id}/><input type="hidden" name="make_admin" value="false"/><button className="admin-danger-button" type="submit">{t("Remove admin access")}</button></form></td></tr>)}
            </tbody></table></div>}
        </SuperAdminDialog>

        <SuperAdminDialog locale={locale} title={t("Customer access")} eyebrow={t("ACCESS ALLOCATION")} description={t("Review the customer directory and control which staff member can access each customer.")} count={customers.length} id="assignments" icon={<Users size={20}/>}>
          <div className="admin-panel-heading"><div><span>{t("ACCESS ALLOCATION")}</span><h2>{t("Assign customers to staff")}</h2></div><span>{customers.length} customers</span></div>
          <p className="admin-help">{t("Each customer can belong to only one staff administrator. Remove the current assignment before assigning that customer to another staff member.")}</p>
          {!admins.length ? <p className="admin-empty">{t("Promote at least one customer to staff administrator before assigning customer accounts.")}</p> :
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("Customer")}</th><th>{t("Bank accounts")}</th><th>{t("Assigned staff")}</th><th>{t("Grant access")}</th></tr></thead><tbody>
              {customers.map((person) => {
                const current = links.filter((link) => link.customer_user_id === person.user_id);
                return <tr key={person.user_id}>
                  <td><strong>{person.display_name}</strong><small>{person.email} · {person.user_id.slice(0, 10)}…</small></td>
                  <td>{person.account_count}</td>
                  <td>{current.length ? current.map((link) => <div className="super-assignment-chip" key={link.id}><span>{personMap.get(link.admin_user_id)?.email ?? link.admin_user_id}</span><form action={superAdminSetAssignment}><input type="hidden" name="admin_user_id" value={link.admin_user_id}/><input type="hidden" name="customer_user_id" value={person.user_id}/><input type="hidden" name="assign" value="false"/><button type="submit" aria-label={t("Remove assignment")}>{t("Remove")}</button></form></div>) : <span className="admin-status pending">{t("Unassigned")}</span>}</td>
                  <td><form action={superAdminSetAssignment} className="super-assignment-form"><input type="hidden" name="customer_user_id" value={person.user_id}/><input type="hidden" name="assign" value="true"/><select name="admin_user_id" defaultValue="" required><option value="" disabled>{t("Select staff admin")}</option>{admins.map((admin) => <option key={admin.user_id} value={admin.user_id}>{admin.email}</option>)}</select><button type="submit" className="secondary">{t("Assign")}</button></form></td>
                </tr>;
              })}
            </tbody></table></div>}
        </SuperAdminDialog>

        <SuperAdminDialog locale={locale} title={t("Promote customers")} eyebrow={t("ROLE MANAGEMENT")} description={t("Choose customer accounts to appoint as staff administrators.")} count={customers.length} id="promote" icon={<ShieldCheck size={20}/>}>
          <div className="admin-panel-heading"><div><span>{t("ROLE MANAGEMENT")}</span><h2>{t("Promote a customer to staff administrator")}</h2></div><UserCog size={18}/></div>
          <p className="admin-help">{t("Promoting an account does not grant access to any customer records. You must separately assign customers above.")}</p>
          <div className="super-promote-list">{customers.map((person) => <form action={superAdminSetRole} key={person.user_id}><div><strong>{person.display_name}</strong><small>{person.email}</small></div><input type="hidden" name="user_id" value={person.user_id}/><input type="hidden" name="make_admin" value="true"/><button type="submit">{t("Promote to staff admin")}</button></form>)}</div>
        </SuperAdminDialog>

        <SuperAdminDialog locale={locale} defaultOpen={Boolean(params.ticket)} title={t("Support oversight")} eyebrow={t("GLOBAL CUSTOMER CARE")} description={t("Read support conversations across Nexora without needing to open each staff workspace.")} count={tickets?.length ?? 0} id="oversight" icon={<MessageSquare size={20}/>}>
          <div className="admin-panel-heading"><div><span>{t("GLOBAL CUSTOMER CARE OVERSIGHT")}</span><h2>{t("All support conversations")}</h2></div><span>{openCount} open · {tickets?.length ?? 0} recent</span></div>
          {ticketError ? <p className="admin-empty">{t("Unable to load support conversations.")}</p> : !tickets?.length ? <p className="admin-empty">{t("No support conversations have been opened.")}</p> :
            <div className="super-support-layout"><div className="admin-ticket-list">{tickets.map((ticket) => <Link href={"/super-admin?ticket=" + ticket.id + "#oversight"} key={ticket.id} className={selected?.id === ticket.id ? "admin-ticket selected" : "admin-ticket"}><strong>{ticket.subject}</strong><span>{personMap.get(ticket.user_id)?.email ?? ticket.user_id} · {t(ticket.category)} · {t(ticket.status.replaceAll("_"," "))}</span><small>{new Date(ticket.updated_at).toLocaleString(locale)}</small></Link>)}</div>
              {selected && <div className="super-support-thread"><div className="admin-panel-heading"><div><span>{t("READ-ONLY CONVERSATION MONITOR")}</span><h2>{selected.subject}</h2></div><MessageSquare size={18}/></div><div className="admin-case-meta"><span>Customer: {personMap.get(selected.user_id)?.email ?? selected.user_id}</span><span>{t("Status")}: {t(selected.status.replaceAll("_"," "))}</span><span>{t("Category")}: {t(selected.category)}</span></div><div className="admin-support-messages">{(messages ?? []).map((message) => <article key={message.id} className={message.sender_role === "admin" ? "admin-support-message staff" : "admin-support-message"}><span>{message.sender_role === "admin" ? "Staff admin" : "Customer"} · {personMap.get(message.sender_user_id)?.email ?? "Account"} · {new Date(message.created_at).toLocaleString(locale)}</span><p>{message.body}</p></article>)}</div></div>}
            </div>}
        </SuperAdminDialog>

        <SuperAdminDialog locale={locale} title="Crypto payment audit" eyebrow="PAYMENT GOVERNANCE" description="Review every crypto payment instruction issued by staff, including exact wallet details, amounts, bot messages and subsequent audit events." count={paymentProcedures?.length ?? 0} id="payment-audit" icon={<ShieldCheck size={20}/>}>
          <div className="admin-panel-heading"><div><span>IMMUTABLE PAYMENT RECORDS</span><h2>Crypto payment procedures</h2></div><span>{paymentProcedures?.length ?? 0} records</span></div>
          {paymentError ? <p className="admin-empty">Unable to load payment procedures: {paymentError.message}</p> : !paymentProcedures?.length ? <p className="admin-empty">No payment procedures have been issued.</p> :
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Issued / staff</th><th>Customer / conversation</th><th>Asset and network</th><th>Receiving address</th><th>Expected amount</th><th>Reference / purpose</th><th>Status</th><th>Customer acknowledgement</th></tr></thead><tbody>
              {paymentProcedures.map((procedure) => <tr key={procedure.id}>
                <td><strong>{new Date(procedure.created_at).toLocaleString(locale)}</strong><small>{personMap.get(procedure.created_by)?.email ?? procedure.created_by}</small></td>
                <td><strong>{personMap.get(procedure.customer_user_id)?.email ?? procedure.customer_user_id}</strong><small>{procedure.conversation_id}</small></td>
                <td><strong>{procedure.cryptocurrency}</strong><small>{procedure.network}</small></td>
                <td><code style={{whiteSpace:"normal",overflowWrap:"anywhere"}}>{procedure.wallet_address}</code></td>
                <td><strong>{String(procedure.expected_amount)} {procedure.amount_currency}</strong></td>
                <td><strong>{procedure.payment_reference}</strong><small>{procedure.purpose}</small></td>
                <td><span className="admin-status pending">{procedure.status.replaceAll("_"," ")}</span>{procedure.cancellation_reason&&<small>{procedure.cancellation_reason}</small>}</td>
                <td>{procedure.customer_acknowledged_at ? new Date(procedure.customer_acknowledged_at).toLocaleString(locale) : "Not acknowledged"}</td>
              </tr>)}
            </tbody></table></div>}
          <div className="admin-panel-heading" style={{marginTop:24}}><div><span>APPEND-ONLY EVENT HISTORY</span><h2>Payment audit trail</h2></div><span>{paymentAudit?.length ?? 0} events</span></div>
          {paymentAuditError ? <p className="admin-empty">Unable to load payment audit events: {paymentAuditError.message}</p> : !paymentAudit?.length ? <p className="admin-empty">No payment audit events yet.</p> :
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Procedure</th><th>Recorded details</th></tr></thead><tbody>
              {paymentAudit.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString(locale)}</td><td>{personMap.get(event.actor_user_id)?.email ?? event.actor_role}</td><td><strong>{event.action}</strong></td><td><code>{event.procedure_id}</code></td><td><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",maxWidth:480,fontSize:11}}>{JSON.stringify(event.details,null,2)}</pre></td></tr>)}
            </tbody></table></div>}
        </SuperAdminDialog>

        <SuperAdminDialog locale={locale} title={t("Account management")} eyebrow={t("ACCOUNT CONTROL")} description={t("Permanently delete customer or staff accounts when they are eligible for closure.")} count={deletableUsers.length + " accounts"} id="accounts" icon={<Trash2 size={20}/>}>
          <div className="admin-panel-heading"><div><span>{t("ACCOUNT CONTROL")}</span><h2>{t("Delete customer or staff accounts")}</h2></div><span>{deletableUsers.length} accounts</span></div>
          <p className="admin-help">{t("Deletion is permanent. Accounts with non-zero balances, pending financial transactions or money remaining in savings goals are blocked. Scheduled transfers are cancelled. Zero-balance bank accounts are closed and ledger history is retained for audit. Super Admin accounts cannot be deleted here.")}</p>
          {!deletableUsers.length ? <p className="admin-empty">{t("There are no customer or staff accounts to manage.")}</p> :
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t("Account holder")}</th><th>{t("Role")}</th><th>{t("Bank accounts")}</th><th>{t("Permanent deletion")}</th></tr></thead><tbody>
              {deletableUsers.map((person) => <tr key={person.user_id}>
                <td><strong>{person.display_name}</strong><small>{person.email}</small></td>
                <td><span className={person.role === "admin" ? "admin-status active" : "admin-status pending"}>{t(person.role === "admin" ? "Staff admin" : "Customer")}</span></td>
                <td>{person.account_count}</td>
                <td><DeleteAccountForm userId={person.user_id} email={person.email}/></td>
              </tr>)}
            </tbody></table></div>}
        </SuperAdminDialog>
        <p className="admin-disclaimer">{t("Super Admin oversight is read-only for customer conversations. Staff administrators remain responsible for replying to their assigned customers. All role and assignment changes are recorded in the audit log.")}</p>
      </section>
    </main>
  );
}
