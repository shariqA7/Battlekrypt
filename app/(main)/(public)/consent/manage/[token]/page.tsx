import type { Metadata } from "next";
import { getManageInfo } from "@/lib/services/parental-consent";
import { getPayoutSummary } from "@/lib/services/payout-methods";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import LocalDate from "@/components/ui/LocalDate";
import PayoutForm from "@/components/consent/PayoutForm";
import WithdrawButton from "./WithdrawButton";

// The link carries a secret: keep it out of search results and referrer headers.
export const metadata: Metadata = { title: "Manage permission", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ManageConsentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await getManageInfo(token);

  if (!info.ok) {
    return (
      <main className="flex-1 px-5 sm:px-6 py-10 max-w-xl mx-auto w-full">
        <SectionHeading className="mb-3">This link isn&apos;t valid</SectionHeading>
        <p className="font-sans text-bk-body text-sm pl-[19px]">Check that you opened the whole link from the approval email.</p>
      </main>
    );
  }

  const payout = await getPayoutSummary(info.playerId);

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-xl mx-auto w-full space-y-6">
      <div>
        <SectionHeading className="mb-2">Permission for {info.childName}</SectionHeading>
        <p className="font-sans text-bk-body text-sm pl-[19px]">
          {info.active ? (
            <>You approved {info.childName} to join tournaments, leagues, scrims and challenges until {info.validUntil && <LocalDate iso={info.validUntil.toISOString()} />}.</>
          ) : info.status === "revoked" ? (
            <>You withdrew permission. {info.childName} can browse BattleKrypt but can&apos;t join anything. They can send you a new request any time.</>
          ) : (
            <>This permission has run out. {info.childName} can send you a new request.</>
          )}
        </p>
      </div>

      {info.active && !info.childIsAdult && (
        <Panel className="p-5">
          <p className="font-sans font-bold text-bk-heading mb-1">Where prizes are paid</p>
          <p className="font-sans text-bk-body text-[13px] mb-4">
            If {info.childName} wins a cash prize, the organizer pays <strong>you</strong>, to the account below. Nothing is ever paid to your child.
          </p>
          <PayoutForm
            endpoint={`/api/consent/manage/${token}/payout`}
            saved={payout.method ? { method: payout.method.method, payeeName: payout.method.payeeName } : null}
            nameLabel="Your full name (the account holder)"
            note="Players can't enter cash-prize tournaments or challenges until you add this."
          />
        </Panel>
      )}

      {info.active && (
        <Panel className="p-5">
          <p className="font-sans font-bold text-bk-heading mb-1">Withdraw permission</p>
          <p className="font-sans text-bk-body text-[13px] mb-4">
            You can do this at any time. {info.childName}&apos;s upcoming entries are cancelled and they can&apos;t join anything new until you approve again. Results already recorded stay in the standings.
          </p>
          <WithdrawButton token={token} childName={info.childName} />
        </Panel>
      )}
    </main>
  );
}
