// GET  /api/admin/organizations?q=&cursor=&limit=&type=organization|institute — the list, 10 at a time
// POST /api/admin/organizations — add an organization or an institute for an existing account.
//   body: { userId, type, orgName, country?, bio?, orgType?, registrationNumber?, website?, city?, address?,
//           contactEmail?, contactPhone?, institute?: { kind, verified, proofPath },
//           kyc?: { docType, fullName, documentNumber, address, frontPath, backPath, selfiePath, checked },
//           planCode?, duration?, liftLimits?, sendSetupEmail?,
//           invoice?: { planCode?, planAmount?, currency?, includeSecurityFee?, securityFeeAmount?, dueDate?, taxRate?, note? } }
//   invoice: bill the organization instead of giving the plan for free (the plan starts when the invoice is paid).
//   sendSetupEmail: the account was just created for this person, so email them the link to choose a password.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { parsePageQuery } from "@/lib/admin-paging";
import { adminCreateOrganization, listOrganizationsPage } from "@/lib/services/admin-organizations";
import { sendPasswordSetupEmail } from "@/lib/services/admin-accounts";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const t = new URL(request.url).searchParams.get("type");
  return NextResponse.json(await listOrganizationsPage({ ...parsePageQuery(request.url), type: t === "organization" || t === "institute" ? t : null }));
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

const MESSAGES: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: "That account doesn't exist." },
  already_organizer: { status: 409, message: "That account already has an organization." },
  name_taken: { status: 409, message: "That organization name is already taken." },
  banned: { status: 409, message: "That account is banned. Lift the ban before adding an organization." },
  not_configured: { status: 503, message: "Identity checks aren't switched on yet (IDENTITY_HASH_SECRET and PAYOUT_ENCRYPTION_KEY)." },
  duplicate_banned_id: { status: 409, message: "That ID number belongs to a banned organizer's account. It can't be used again." },
};

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const k = b.kyc && typeof b.kyc === "object" ? b.kyc : null;
  const inst = b.institute && typeof b.institute === "object" ? b.institute : null;

  const result = await adminCreateOrganization({
    adminId: auth.admin.id,
    userId: String(b.userId ?? ""),
    type: b.type === "institute" ? "institute" : "organization",
    orgName: String(b.orgName ?? ""),
    country: str(b.country),
    bio: str(b.bio),
    orgType: str(b.orgType),
    registrationNumber: str(b.registrationNumber),
    website: str(b.website),
    city: str(b.city),
    address: str(b.address),
    contactEmail: str(b.contactEmail),
    contactPhone: str(b.contactPhone),
    institute: inst ? { kind: str(inst.kind), verified: inst.verified === true, proofPath: inst.proofPath } : undefined,
    kyc: k
      ? {
          docType: String(k.docType ?? ""),
          fullName: str(k.fullName) ?? "",
          documentNumber: str(k.documentNumber) ?? "",
          address: str(k.address) ?? "",
          frontPath: k.frontPath,
          backPath: k.backPath,
          selfiePath: k.selfiePath,
          checked: k.checked === true,
        }
      : null,
    planCode: str(b.planCode) || undefined,
    duration: b.duration,
    liftLimits: b.liftLimits === true,
    invoice:
      b.invoice && typeof b.invoice === "object"
        ? {
            planCode: str(b.invoice.planCode) || null,
            planAmount: typeof b.invoice.planAmount === "number" ? b.invoice.planAmount : null,
            currency: str(b.invoice.currency),
            includeSecurityFee: b.invoice.includeSecurityFee === true,
            securityFeeAmount: typeof b.invoice.securityFeeAmount === "number" ? b.invoice.securityFeeAmount : null,
            dueDate: b.invoice.dueDate,
            taxRate: typeof b.invoice.taxRate === "number" ? b.invoice.taxRate : null,
            note: str(b.invoice.note) ?? null,
          }
        : null,
  });

  if ("error" in result) {
    const m = MESSAGES[result.error];
    const message = "message" in result ? result.message : (m?.message ?? "Invalid request.");
    return NextResponse.json({ error: { code: result.error, message } }, { status: m?.status ?? 400 });
  }
  let setupEmailSent: boolean | null = null;
  if (b.sendSetupEmail === true) {
    const u = await prisma.user.findUnique({ where: { id: String(b.userId ?? "") }, select: { email: true } });
    setupEmailSent = u?.email ? await sendPasswordSetupEmail(u.email, new URL(request.url).origin) : false;
  }
  return NextResponse.json({ ...result.data, setupEmailSent }, { status: 201 });
}
