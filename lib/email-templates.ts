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

export function consentApprovedEmail(opts: { to: string; childName: string; manageLink: string; validUntil: Date }): EmailMessage {
  const { to, childName, manageLink, validUntil } = opts;
  const until = validUntil.toISOString().slice(0, 10);
  const subject = `You approved ${childName} on BattleKrypt`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1c1a14">
<h2 style="margin:0 0 12px">Thank you, ${esc(childName)} is approved</h2>
<p>You gave permission for ${esc(childName)} to join tournaments, leagues, scrims and challenges on BattleKrypt until <strong>${until}</strong>.</p>
<p>Use the button below any time to <strong>withdraw your permission</strong> or to set <strong>where any prize is paid</strong>. Prizes are paid to you, not to your child.</p>
<p style="margin:24px 0"><a href="${esc(manageLink)}" style="background:#1c1a14;color:#fff;padding:12px 20px;text-decoration:none;font-weight:bold">Manage permission and payments</a></p>
<p style="font-size:13px;color:#555">Keep this email. Anyone with this link can change these settings, so don't share it.</p>
</div>`;
  const text = `Thank you, ${childName} is approved\n\nYou gave permission for ${childName} to join tournaments, leagues, scrims and challenges on BattleKrypt until ${until}.\n\nWithdraw your permission or set where prizes are paid (to you, not your child):\n${manageLink}\n\nKeep this email. Anyone with this link can change these settings.`;
  return { to, subject, html, text };
}

export function consentWithdrawnEmail(opts: { to: string; childName: string }): EmailMessage {
  const { to, childName } = opts;
  const subject = `You withdrew permission for ${childName} on BattleKrypt`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1c1a14">
<h2 style="margin:0 0 12px">Permission withdrawn</h2>
<p>${esc(childName)}'s upcoming entries have been cancelled and they can no longer join anything new on BattleKrypt. They can still browse.</p>
<p>If this wasn't you, or you change your mind, ${esc(childName)} can send you a new request at any time.</p>
</div>`;
  const text = `Permission withdrawn\n\n${childName}'s upcoming entries have been cancelled and they can no longer join anything new on BattleKrypt. They can still browse.\n\nIf this wasn't you, or you change your mind, ${childName} can send you a new request at any time.`;
  return { to, subject, html, text };
}

// ---------------------------------------------------------------- account deletion

const shell = (title: string, body: string) =>
  `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1c1a14"><h2 style="margin:0 0 12px">${title}</h2>${body}</div>`;

export function deletionScheduledEmail(opts: { to: string; dueAt: Date; accountLink: string }): EmailMessage {
  const due = opts.dueAt.toISOString().slice(0, 10);
  const subject = "Your BattleKrypt account will be deleted";
  const html = shell("Account deletion scheduled", `<p>We received a request to delete your BattleKrypt account. It will be permanently deleted on <strong>${due}</strong>.</p><p>Changed your mind, or didn't ask for this? Sign in and cancel before then:</p><p style="margin:24px 0"><a href="${esc(opts.accountLink)}" style="background:#1c1a14;color:#fff;padding:12px 20px;text-decoration:none;font-weight:bold">Review or cancel</a></p><p style="font-size:13px;color:#555">If you did not request this, someone may have access to your account: sign in, cancel the deletion, and change your password.</p>`);
  const text = `Account deletion scheduled\n\nWe received a request to delete your BattleKrypt account. It will be permanently deleted on ${due}.\n\nChanged your mind, or didn't ask for this? Sign in and cancel before then:\n${opts.accountLink}\n\nIf you did not request this, someone may have access to your account: sign in, cancel the deletion, and change your password.`;
  return { to: opts.to, subject, html, text };
}

export function deletionBlockedEmail(opts: { to: string; reasons: string[]; accountLink: string }): EmailMessage {
  const subject = "Your account deletion was cancelled";
  const items = opts.reasons.map((r) => `<li>${esc(r)}</li>`).join("");
  const html = shell("We couldn't delete your account yet", `<p>Your scheduled account deletion was cancelled because something is still open on your account:</p><ul>${items}</ul><p>Once that is sorted out you can request deletion again.</p><p style="margin:24px 0"><a href="${esc(opts.accountLink)}" style="background:#1c1a14;color:#fff;padding:12px 20px;text-decoration:none;font-weight:bold">Go to your account</a></p>`);
  const text = `We couldn't delete your account yet\n\nYour scheduled account deletion was cancelled because something is still open on your account:\n- ${opts.reasons.join("\n- ")}\n\nOnce that is sorted out you can request deletion again:\n${opts.accountLink}`;
  return { to: opts.to, subject, html, text };
}

export function deletionCompletedEmail(opts: { to: string }): EmailMessage {
  const subject = "Your BattleKrypt account has been deleted";
  const html = shell("Account deleted", `<p>Your BattleKrypt account and the personal information on it have been deleted. We keep only what the law requires us to keep (for example payment and invoice records), which no longer carry your name.</p><p>You're welcome to sign up again any time.</p>`);
  const text = `Account deleted\n\nYour BattleKrypt account and the personal information on it have been deleted. We keep only what the law requires us to keep (for example payment and invoice records), which no longer carry your name.\n\nYou're welcome to sign up again any time.`;
  return { to: opts.to, subject, html, text };
}
