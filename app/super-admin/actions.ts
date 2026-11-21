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

export async function superAdminDeleteAccount(formData: FormData) {
  const supabase = await requireSuperAdmin();
  const userId = String(formData.get("user_id") || "");
  const confirmEmail = String(formData.get("confirm_email") || "").trim();
  if (!userId || !confirmEmail) result("error", "Choose an account and type its email address to confirm deletion.");

  const { data: preview, error: previewError } = await supabase.rpc("super_admin_prepare_account_deletion", {
    p_user_id: userId,
  });
  if (previewError) result("error", previewError.message);
  const expectedEmail = String(preview?.email || "");
  if (!expectedEmail || confirmEmail.toLowerCase() !== expectedEmail.toLowerCase()) {
    result("error", "The confirmation email does not match the selected account.");
  }

  const objects = Array.isArray(preview?.storage_objects) ? preview.storage_objects as Array<{ bucket_id: string; name: string }> : [];
  const documentPaths = objects
    .filter((object) => object.bucket_id === "identity-documents" && typeof object.name === "string")
    .map((object) => object.name);
  if (documentPaths.length) {
    const { error: storageError } = await supabase.storage.from("identity-documents").remove(documentPaths);
    if (storageError) result("error", "The account was not deleted because its private identity files could not be removed: " + storageError.message);
  }

  const { data, error } = await supabase.rpc("super_admin_delete_account", {
    p_user_id: userId,
    p_confirm_email: confirmEmail,
  });
  if (error) result("error", error.message);
  revalidatePath("/super-admin");
  revalidatePath("/admin");
  const closedAccounts = Number(data?.closed_accounts || 0);
  const cancelledTransfers = Number(data?.cancelled_scheduled_transfers || 0);
  result("success", "Account permanently deleted. " + closedAccounts + " zero-balance bank account(s) were closed, financial history was retained, and " + cancelledTransfers + " scheduled transfer(s) were cancelled.");
}
