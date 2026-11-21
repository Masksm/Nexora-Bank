import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Activity, Eye, LogOut, ShieldCheck, Users, UserCog, MessageSquare, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { superAdminSetAssignment, superAdminSetRole } from "./actions";
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
  const [{ data: directory, error: directoryError }, { data: assignments }, { data: tickets, error: ticketError }] = await Promise.all([
    supabase.rpc("super_admin_directory"),
    supabase.from("admin_customer_assignments").select("id,admin_user_id,customer_user_id,created_at").order("created_at", { ascending: false }),
    supabase.from("support_conversations").select("id,user_id,subject,category,status,created_at,updated_at").order("updated_at", { ascending: false }).limit(100),
  ]);
  const people = (directory ?? []) as DirectoryUser[];
  const links = (assignments ?? []) as Assignment[];
  const admins = people.filter((person) => person.role === "admin");
  const customers = people.filter((person) => !["admin", "super_admin"].includes(person.role));
  const selected = (tickets ?? []).find((ticket) => ticket.id === params.ticket) ?? (tickets ?? [])[0];
  const { data: messages } = selected
    ? await supabase.from("support_messages").select("id,sender_user_id,sender_role,body,created_at").eq("conversation_id", selected.id).order("created_at").limit(250)
    : { data: [] };
  const personMap = new Map(people.map((person) => [person.user_id, person]));
  const staffCount = admins.length;
  const assignmentCount = links.length;
  const openCount = (tickets ?? []).filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length;
  const locale = (await cookies()).get("nexora_locale")?.value || "en";

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/super-admin"><span>N</span>NEXORA <i>SUPER ADMIN</i></Link>
        <div className="admin-side-label">EXECUTIVE CONTROL</div>
        <nav>
          <Link className="selected" href="/super-admin"><Activity size={16}/> Overview</Link>
          <a href="#staff"><UserCog size={16}/> Staff administrators</a>
          <a href="#assignments"><Users size={16}/> Customer access</a>
          <a href="#oversight"><Eye size={16}/> Support oversight</a>
          <Link href="/admin"><LockKeyhole size={16}/> Legacy admin operations</Link>
        </nav>
        <div className="admin-sidebar-foot"><ShieldCheck size={16}/><span>Super Admin session</span><form action={signOut}><button className="admin-logout-button" type="submit"><LogOut size={15}/> Sign out</button></form></div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar"><div><span>EXECUTIVE ADMINISTRATION / GLOBAL CONTROL</span><h1>Super Admin command centre</h1></div><span className="admin-status active">Highest access level</span></header>
        <div className="admin-welcome"><div><span>GLOBAL OVERSIGHT</span><h2>Administrator governance</h2><p>Manage staff authority, customer ownership and support visibility across Nexora.</p></div><div className="admin-identity"><ShieldCheck size={18}/><span>{user.email}<small>Super Administrator</small></span></div></div>
        {params.message && <div className={params.kind === "error" ? "admin-alert error" : "admin-alert success"} role="status">{params.message}</div>}
        <section className="admin-stats">
          <article><span><Users size={17}/> CUSTOMER ACCOUNTS</span><strong>{customers.length}</strong><small>All registered non-admin accounts</small></article>
          <article><span><UserCog size={17}/> STAFF ADMINS</span><strong>{staffCount}</strong><small>Restricted administrator accounts</small></article>
          <article><span><LockKeyhole size={17}/> ACTIVE ASSIGNMENTS</span><strong>{assignmentCount}</strong><small>Customer-to-admin access links</small></article>
        </section>

        <SuperAdminDialog title="Staff administrators" eyebrow="STAFF AUTHORITY" description="Review staff administrator accounts and manage their access." count={staffCount} staf} icon={<UserCog size={20}/>}>
          <div className="admin-panel-heading"><div><span>STAFF AUTHORITY</span><h2>Staff administrator accounts</h2></div><span>{staffCount} staff</span></div>
          {directoryError ? <p className="admin-empty">Unable to load the administrator directory: {directoryError.message}</p> : !admins.length ? <p className="admin-empty">No staff administrators have been appointed yet.</p> :
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Staff administrator</th><th>Assigned customers</th><th>Access</th></tr></thead><tbody>
              {admins.map((person) => <tr key={person.user_id}><td><strong>{person.display_name}</strong><small>{person.email} · {person.user_id.slice(0, 10)}…</small></td><td>{person.assigned_customer_count}</td><td><form action={superAdminSetRole}><input type="hidden" name="user_id" value={person.user_id}/><input type="hidden" name="make_admin" value="false"/><button className="admin-danger-button" type="submit">Revoke staff role</button></form></td></tr>)}
            </tbody></table></div>}
        </SuperAdminDialog>

        <SuperAdminDialog title="Customer access" eyebrow="ACCESS ALLOCATION" description="Review the customer directory and control which staff member can access each customer." count={customers.length} customer} icon={<Users size={20}/>}>
          <div className="admin-panel-heading"><div><span>ACCESS ALLOCATION</span><h2>Assign customers to staff</h2></div><span>{customers.length} customers</span></div>
          <p className="admin-help">A staff administrator can only access the customers explicitly assigned here. Assigning a customer to a second staff member gives both staff members access to that customer.</p>
          {!admins.length ? <p className="admin-empty">Promote at least one customer to staff administrator before assigning customer accounts.</p> :
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Bank accounts</th><th>Assigned staff</th><th>Grant access</th></tr></thead><tbody>
              {customers.map((person) => {
                const current = links.filter((link) => link.customer_user_id === person.user_id);
                return <tr key={person.user_id}>
                  <td><strong>{person.display_name}</strong><small>{person.email} · {person.user_id.slice(0, 10)}…</small></td>
                  <td>{person.account_count}</td>
                  <td>{current.length ? current.map((link) => <div className="super-assignment-chip" key={link.id}><span>{personMap.get(link.admin_user_id)?.email ?? link.admin_user_id}</span><form action={superAdminSetAssignment}><input type="hidden" name="admin_user_id" value={link.admin_user_id}/><input type="hidden" name="customer_user_id" value={person.user_id}/><input type="hidden" name="assign" value="false"/><button type="submit" aria-label="Remove assignment">Remove</button></form></div>) : <span className="admin-status pending">Unassigned</span>}</td>
                  <td><form action={superAdminSetAssignment} className="super-assignment-form"><input type="hidden" name="customer_user_id" value={person.user_id}/><input type="hidden" name="assign" value="true"/><select name="admin_user_id" defaultValue="" required><option value="" disabled>Select staff admin</option>{admins.map((admin) => <option key={admin.user_id} value={admin.user_id}>{admin.email}</option>)}</select><button type="submit" className="secondary">Assign</button></form></td>
                </tr>;
              })}
            </tbody></table></div>}
        </SuperAdminDialog>

        <SuperAdminDialog title="Promote customers" eyebrow="ROLE MANAGEMENT" description="Choose customer accounts to appoint as staff administrators." count={customers.length} eligibl} icon={<ShieldCheck size={20}/>}>
          <div className="admin-panel-heading"><div><span>ROLE MANAGEMENT</span><h2>Promote a customer to staff administrator</h2></div><UserCog size={18}/></div>
          <p className="admin-help">Promoting an account does not grant access to any customer records. You must separately assign customers above.</p>
          <div className="super-promote-list">{customers.map((person) => <form action={superAdminSetRole} key={person.user_id}><div><strong>{person.display_name}</strong><small>{person.email}</small></div><input type="hidden" name="user_id" value={person.user_id}/><input type="hidden" name="make_admin" value="true"/><button type="submit">Promote to staff admin</button></form>)}</div>
        </SuperAdminDialog>

        <SuperAdminDialog title="Support oversight" eyebrow="GLOBAL CUSTOMER CARE" description="Read support conversations across Nexora without needing to open each staff workspace." count={tickets?.length ?? 0} conversation} icon={<MessageSquare size={20}/>}>
          <div className="admin-panel-heading"><div><span>GLOBAL CUSTOMER CARE OVERSIGHT</span><h2>All support conversations</h2></div><span>{openCount} open · {tickets?.length ?? 0} recent</span></div>
          {ticketError ? <p className="admin-empty">Unable to load support conversations.</p> : !tickets?.length ? <p className="admin-empty">No support conversations have been opened.</p> :
            <div className="super-support-layout"><div className="admin-ticket-list">{tickets.map((ticket) => <Link href={"/super-admin?ticket=" + ticket.id + "#oversight"} key={ticket.id} className={selected?.id === ticket.id ? "admin-ticket selected" : "admin-ticket"}><strong>{ticket.subject}</strong><span>{personMap.get(ticket.user_id)?.email ?? ticket.user_id} · {ticket.category} · {ticket.status}</span><small>{new Date(ticket.updated_at).toLocaleString(locale)}</small></Link>)}</div>
              {selected && <div className="super-support-thread"><div className="admin-panel-heading"><div><span>READ-ONLY CONVERSATION MONITOR</span><h2>{selected.subject}</h2></div><MessageSquare size={18}/></div><div className="admin-case-meta"><span>Customer: {personMap.get(selected.user_id)?.email ?? selected.user_id}</span><span>Status: {selected.status}</span><span>Category: {selected.category}</span></div><div className="admin-support-messages">{(messages ?? []).map((message) => <article key={message.id} className={message.sender_role === "admin" ? "admin-support-message staff" : "admin-support-message"}><span>{message.sender_role === "admin" ? "Staff admin" : "Customer"} · {personMap.get(message.sender_user_id)?.email ?? "Account"} · {new Date(message.created_at).toLocaleString(locale)}</span><p>{message.body}</p></article>)}</div></div>}
            </div>}
        </SuperAdminDialog>
        <p className="admin-disclaimer">Super Admin oversight is read-only for customer conversations. Staff administrators remain responsible for replying to their assigned customers. All role and assignment changes are recorded in the audit log.</p>
      </section>
    </main>
  );
}
