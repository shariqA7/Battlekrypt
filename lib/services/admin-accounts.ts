// Lets an admin add an organization for someone who has no account yet. The account is
// created on the server (confirmed, no password), then the person gets the same "set your
// password" email as the Forgot password page, once the organization has been saved.
//
// Uses the service-role key, so it stays in this one function (see lib/supabase/admin.ts).
import { prisma } from "@/lib/prisma";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ensureUserRecord } from "@/lib/ensure-user";
import { isValidEmail, normalizeEmail } from "@/lib/validation/auth";

export type AccountResult =
  | { data: { userId: string; created: boolean } }
  | { error: "invalid_email" | "invalid_name" | "not_configured" | "failed"; message?: string };

export async function adminEnsureAccount(input: { adminId: string; email: string; name: string; phone?: string }): Promise<AccountResult> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!isValidEmail(email)) return { error: "invalid_email" };
  if (name.length < 2 || name.length > 80) return { error: "invalid_name" };

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { data: { userId: existing.id, created: false } };

  let service;
  try {
    service = createServiceClient();
  } catch {
    return { error: "not_configured" };
  }
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
  if (error || !data.user) {
    return { error: "failed", message: error?.message ?? "Couldn't create the account." };
  }
  await ensureUserRecord(data.user);
  const phone = input.phone?.trim();
  if (phone) await prisma.playerProfile.updateMany({ where: { userId: data.user.id }, data: { mobileNumber: phone.slice(0, 40) } });
  await prisma.adminActionLog.create({
    data: { adminId: input.adminId, action: "created_account_for_organizer", targetType: "User", targetId: data.user.id, notes: email },
  });
  return { data: { userId: data.user.id, created: true } };
}

// The email that lets the person choose a password (the Forgot password flow).
export async function sendPasswordSetupEmail(email: string, origin: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirectTo=${encodeURIComponent("/reset-password")}`,
  });
  return !error;
}
