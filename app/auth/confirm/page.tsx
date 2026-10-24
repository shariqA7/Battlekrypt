import type { Metadata } from "next";
import Link from "next/link";
import { parseConfirmParams, isRecovery } from "@/lib/auth-confirm";
import { buttonClass } from "@/components/ui/Button";

// The link in the email lands here and does NOT use up the token: some email systems open
// every link automatically to scan it, which would burn a one-time token before the person
// ever saw it. The token is only spent when they press the button (a POST).
export const metadata: Metadata = { title: "Confirm", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const params = parseConfirmParams((k) => sp[k] ?? null, process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin : undefined);

  const shell = (children: React.ReactNode) => (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-[420px] rounded-2xl border border-bk-border bg-bk-bg p-7 text-center" style={{ boxShadow: "0 0 60px rgba(244,200,66,0.07)" }}>
        {children}
      </div>
    </main>
  );

  if (!params) {
    return shell(
      <>
        <h1 className="font-sans font-extrabold text-[24px] text-bk-heading mb-2">This link isn&apos;t valid</h1>
        <p className="font-sans text-[14px] text-bk-body mb-5">Open the whole link from your email, or log in to get a new one.</p>
        <Link href="/login" className={buttonClass("primary", "lg", "w-full rounded-xl")}>Go to login</Link>
      </>
    );
  }

  const recovery = isRecovery(params.type);
  return shell(
    <form method="POST" action="/api/auth/confirm">
      <input type="hidden" name="token_hash" value={params.tokenHash} />
      <input type="hidden" name="type" value={params.type} />
      <input type="hidden" name="next" value={recovery ? "/reset-password" : params.next} />
      <h1 className="font-sans font-extrabold text-[26px] leading-tight text-bk-heading mb-2">
        {recovery ? "Reset your password" : "Confirm your email"}
      </h1>
      <p className="font-sans text-[14px] text-bk-body mb-6">
        {recovery ? "Press the button to choose a new password." : "Press the button to finish creating your account and log in."}
      </p>
      <button type="submit" className={buttonClass("primary", "lg", "w-full rounded-xl")}>
        {recovery ? "Continue" : "Confirm my email"}
      </button>
    </form>
  );
}
