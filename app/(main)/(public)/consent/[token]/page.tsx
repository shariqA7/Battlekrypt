import type { Metadata } from "next";
import { getConsentLinkInfo, supportEmail } from "@/lib/services/parental-consent";
import { waiverParagraphs } from "@/lib/consent-waiver";
import { CONSENT_VALID_DAYS } from "@/lib/consent-config";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import LocalDate from "@/components/ui/LocalDate";
import ConsentForm from "./ConsentForm";

// The link carries a secret: keep it out of search results and referrer headers.
export const metadata: Metadata = { title: "Parent or guardian approval", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { title: string; body: string }> = {
  not_found: { title: "This link isn't valid", body: "Check that you opened the whole link from the email, or ask your child to send a new request." },
  expired: { title: "This link has expired", body: "Ask your child to send a new request from their BattleKrypt dashboard." },
  already_declined: { title: "You declined this request", body: "Nothing was approved. If you change your mind, ask your child to send a new request." },
  closed: { title: "This request is no longer open", body: "A newer request replaced it. Please use the most recent email." },
};

export default async function ConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await getConsentLinkInfo(token);

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-xl mx-auto w-full">
      <SectionHeading className="mb-3">Parent or guardian approval</SectionHeading>

      {info.ok ? (
        <>
          <p className="font-sans text-bk-body text-sm mb-6 pl-[19px]">
            <strong className="text-bk-heading">{info.childName}</strong> wants to take part in{" "}
            {info.requestedFor ? <strong className="text-bk-heading">{info.requestedFor}</strong> : "tournaments"} on BattleKrypt, an esports
            tournament platform. Because they are under 18, we need your permission first.
          </p>
          <Panel className="p-5 mb-6">
            <p className="font-sans font-bold text-[11px] uppercase tracking-[1.6px] text-bk-muted mb-3">The waiver</p>
            <ol className="list-decimal pl-5 flex flex-col gap-2.5 font-sans text-bk-body text-[13px] leading-relaxed">
              {waiverParagraphs(supportEmail()).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </Panel>
          <ConsentForm token={token} childName={info.childName} validDays={CONSENT_VALID_DAYS} />
          <p className="font-sans text-bk-muted text-[11px] mt-6">
            This link works until <LocalDate iso={info.linkExpiresAt.toISOString()} /> and can only be used once.
          </p>
        </>
      ) : info.reason === "already_approved" ? (
        <Panel className="p-5">
          <p className="font-sans font-bold text-bk-heading mb-1">Already approved</p>
          <p className="font-sans text-bk-body text-sm">
            Consent was recorded{info.validUntil ? <> and is valid until <LocalDate iso={info.validUntil.toISOString()} /></> : ""}. To withdraw it,
            email {supportEmail()}.
          </p>
        </Panel>
      ) : (
        <Panel className="p-5">
          <p className="font-sans font-bold text-bk-heading mb-1">{MESSAGES[info.reason].title}</p>
          <p className="font-sans text-bk-body text-sm">{MESSAGES[info.reason].body}</p>
        </Panel>
      )}
    </main>
  );
}
