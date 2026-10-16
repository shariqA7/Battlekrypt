import type { EmailMessage } from "@/lib/email";
import { CONSENT_VALID_DAYS } from "@/lib/consent-config";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The email a guardian receives. `childName` is already shortened ("Ahmed K.").
export function consentRequestEmail(opts: {
  to: string;
  childName: string;
  requestedFor?: string | null;
  link: string;
  linkExpiresAt: Date;
}): EmailMessage {
  const { to, childName, requestedFor, link, linkExpiresAt } = opts;
  const expires = linkExpiresAt.toISOString().slice(0, 10);
  const subject = requestedFor
    ? `Action required: approve ${childName}'s participation in ${requestedFor}`
    : `Action required: approve ${childName}'s participation on BattleKrypt`;

  const intro = requestedFor
    ? `${childName} wants to take part in <strong>${esc(requestedFor)}</strong> on BattleKrypt, an esports tournament platform. Because they are under 18, we need a parent or legal guardian's permission first.`
    : `${childName} wants to take part in tournaments on BattleKrypt, an esports tournament platform. Because they are under 18, we need a parent or legal guardian's permission first.`;
  const introText = intro.replace(/<[^>]+>/g, "");

  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1c1a14">
<h2 style="margin:0 0 12px">Parent or guardian approval needed</h2>
<p>${intro}</p>
<p>Please read and sign the short waiver on this page. If you approve, it covers tournaments that ask for consent for <strong>${CONSENT_VALID_DAYS === 365 ? "one year" : `${CONSENT_VALID_DAYS} days`}</strong>.</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#1c1a14;color:#fff;padding:12px 20px;text-decoration:none;font-weight:bold">Review and decide</a></p>
<p style="font-size:13px;color:#555">This link works until ${expires} and can only be used once. If you don't know about this request, ignore this email and nothing will happen. Never share this link: whoever has it can sign for you.</p>
</div>`;
  const text = `Parent or guardian approval needed\n\n${introText}\n\nPlease read and sign the short waiver here (valid for one year if you approve):\n${link}\n\nThis link works until ${expires} and can only be used once. If you don't know about this request, ignore this email and nothing will happen. Never share this link.`;

  return { to, subject, html, text };
}
