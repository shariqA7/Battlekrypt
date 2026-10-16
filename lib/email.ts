// Sends email through Resend's HTTP API (no extra package).
//
// Without a verified domain Resend only lets `onboarding@resend.dev` send, and only to
// the email your Resend account was made with. So:
//   RESEND_API_KEY   — required to send. Missing: dev logs the email, production refuses.
//   EMAIL_FROM       — "BattleKrypt <notifications@yourdomain.com>" once a domain is verified.
//                      Default is Resend's test sender.
//   EMAIL_TEST_TO    — while set, EVERY email goes to this address instead (with the real
//                      recipient shown in the subject and at the top). Remove when live.
//   EMAIL_REPLY_TO   — optional, e.g. a Gmail address until you have a business mailbox.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_TEST_TO?: string;
  EMAIL_REPLY_TO?: string;
  NODE_ENV?: string;
}

export type SendResult =
  | { ok: true; logged?: boolean; redirected?: boolean }
  | { ok: false; error: "email_not_configured" | "email_failed"; detail?: string };

const DEFAULT_FROM = "BattleKrypt <onboarding@resend.dev>";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Pure: what we would send to Resend for this message and environment.
export function buildOutgoing(msg: EmailMessage, env: EmailEnv) {
  const testTo = env.EMAIL_TEST_TO?.trim();
  const redirected = !!testTo;
  const banner = `Test mode: this email was meant for ${msg.to}.`;
  const payload: Record<string, unknown> = {
    from: env.EMAIL_FROM?.trim() || DEFAULT_FROM,
    to: [redirected ? testTo : msg.to],
    subject: redirected ? `[TEST → ${msg.to}] ${msg.subject}` : msg.subject,
    html: redirected ? `<p style="background:#fff3cd;padding:8px">${escapeHtml(banner)}</p>${msg.html}` : msg.html,
    text: redirected ? `${banner}\n\n${msg.text}` : msg.text,
  };
  if (env.EMAIL_REPLY_TO?.trim()) payload.reply_to = env.EMAIL_REPLY_TO.trim();
  return { payload, redirected };
}

export async function sendEmail(
  msg: EmailMessage,
  env: EmailEnv = process.env as EmailEnv,
  fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
  const { payload, redirected } = buildOutgoing(msg, env);

  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === "production") return { ok: false, error: "email_not_configured" };
    console.log(`[email not sent: no RESEND_API_KEY] to=${String(payload.to)} subject=${String(payload.subject)}\n${msg.text}`);
    return { ok: true, logged: true, redirected };
  }

  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = typeof body?.message === "string" ? body.message.slice(0, 200) : `HTTP ${res.status}`;
      return { ok: false, error: "email_failed", detail };
    }
    return { ok: true, redirected };
  } catch (e) {
    return { ok: false, error: "email_failed", detail: e instanceof Error ? e.message.slice(0, 200) : "network error" };
  }
}
