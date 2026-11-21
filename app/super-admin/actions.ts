"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.auth.getClaims();
  const meta = data?.claims?.app_metadata as { role?: string } | undefined;
  if (!user || error || meta?.role !== "super_admin") redirect("/login");
  return supabase;
}

function result(kind: string, message: string): never {
  redirect("/super-admin?kind=" + encodeURIComponent(kind) + "&message=" + encodeURIComponent(message));
}

export async function superAdminSetRole(formData: FormData) {
  const supabase = await requireSuperAdmin();
  const userId = String(formData.get("user_id") || "");
  const makeAdmin = String(formData.get("make_admin") || "") === "true";
  if (!userId) result("error", "Select a customer account.");
  const { error } = await supabase.rpc("super_admin_set_staff_role", {
    p_user_id: userId,
    p_make_admin: makeAdmin,
  });
  if (error) result("error", error.message);
  revalidatePath("/super-admin");
  revalidatePath("/admin");
  result("success", makeAdmin ? "Staff administrator access granted. The user must sign in again to refresh permissions." : "Staff administrator access removed and all customer assignments cleared.");
}

export async function superAdminSetAssignment(formData: FormData) {
  const supabase = await requireSuperAdmin();
  const adminUserId = String(formData.get("admin_user_id") || "");
  const customerUserId = String(formData.get("customer_user_id") || "");
  const assign = String(formData.get("assign") || "") === "true";
  if (!adminUserId || !customerUserId) result("error", "Choose both a staff administrator and a customer.");
  const { error } = await supabase.rpc("super_admin_set_customer_assignment", {
    p_admin_user_id: adminUserId,
    p_customer_user_id: customerUserId,
    p_assign: assign,
  });
  if (error) result("error", error.message);
  revalidatePath("/super-admin");
  revalidatePath("/admin");
  result("success", assign ? "Customer assigned to staff administrator." : "Customer access removed from staff administrator.");
}
