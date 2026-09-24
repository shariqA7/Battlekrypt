import Link from "next/link";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-[380px]">
        <Link
          href="/login"
          className="inline-block font-sans text-[12px] text-bk-muted mb-6 hover:text-bk-heading transition-colors"
        >
          &larr; Back to sign in
        </Link>
        <p className="font-sans font-extrabold text-[32px] leading-[1.15] text-bk-heading mb-2">
          Reset your password
        </p>
        <p className="font-sans text-[14px] text-bk-body mb-7">
          Enter your email and we&apos;ll send you a link to reset it.
        </p>
        <div
          className="rounded-2xl border border-bk-border p-7"
          style={{ boxShadow: "0 0 60px rgba(244,200,66,0.07)" }}
        >
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  );
}
