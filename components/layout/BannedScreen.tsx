// Shown instead of the page content when the signed-in account is banned.
// Banned users can still sign in (and sign out from the menu above), but
// nothing else on the platform works until the ban ends or is lifted.
export default function BannedScreen({
  reason,
  endsAt,
  supportEmail,
}: {
  reason: string;
  endsAt: Date | null;
  supportEmail: string | null;
}) {
  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full bg-bk-surface border border-bk-live/40 p-6">
        <span className="inline-block bg-bk-live-bg text-bk-live font-sans text-[11px] uppercase tracking-[0.8px] px-2.5 py-1 mb-4">
          Account restricted
        </span>
        <h1 className="font-sans font-extrabold text-xl text-bk-heading mb-3">
          Your account has been blocked
        </h1>
        <p className="font-sans text-bk-body text-[13px] leading-relaxed mb-3">{reason}</p>
        <p className="font-sans text-bk-muted text-[12px] mb-4">
          {endsAt
            ? `This restriction ends on ${endsAt.toLocaleString()}.`
            : "This restriction has no end date."}
        </p>
        <p className="font-sans text-bk-body text-[13px]">
          If you think this is a mistake, please contact customer support
          {supportEmail ? (
            <>
              {" "}at{" "}
              <a href={`mailto:${supportEmail}`} className="text-bk-gold-light underline">
                {supportEmail}
              </a>
            </>
          ) : null}
          .
        </p>
      </div>
    </main>
  );
}
