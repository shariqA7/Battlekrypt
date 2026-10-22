import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordForm from "./ResetPasswordForm";

// Needs the temporary session the emailed link creates (via /auth/callback).
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-[420px]">
        <h1 className="font-sans font-extrabold text-[32px] leading-[1.15] text-bk-heading mb-2 text-center">
          Set a new password
        </h1>
        <p className="font-sans text-[14px] text-bk-body mb-7 text-center">
          Choose a new password for your account.
        </p>
        <div
          className="rounded-2xl border border-bk-border bg-bk-bg p-6 sm:p-7"
          style={{ boxShadow: "0 0 60px rgba(244,200,66,0.07)" }}
        >
          {user ? (
            <ResetPasswordForm />
          ) : (
            <div className="text-center">
              <p className="font-sans text-[14px] text-bk-live mb-4">
                This reset link has expired or was already used.
              </p>
              <Link href="/forgot-password" className="font-sans text-[13px] text-bk-gold-light underline underline-offset-2">
                Request a new reset link
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
