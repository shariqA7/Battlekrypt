// GET  /api/organizer/identity — status of this organizer's identity check
// POST /api/organizer/identity — submit it.
//   Body: { docType: "nic"|"passport", fullName, documentNumber, address,
//           frontPath, backPath (NIC only), selfiePath, consent: true }
// The files are already in the private bucket (uploaded from the browser into
// the organizer's own folder); this only records their paths.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { getIdentityForOrganizer, submitIdentity } from "@/lib/services/identity";

const MESSAGES: Record<string, string> = {
  not_approved: "Your organization has to be approved before you can verify your identity.",
  already_pending: "Your documents are already waiting for review.",
  already_verified: "Your identity is already verified.",
  invalid: "Enter your full name and document number exactly as on the document.",
  no_consent: "Please confirm that you agree to the identity check.",
  bad_files: "Upload the document photos and the selfie again.",
  not_configured: "Identity checks aren't switched on yet. Please try again later.",
};

export async function GET() {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await getIdentityForOrganizer(auth.organizerProfile.id));
}

export async function POST(request: Request) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));

  const result = await submitIdentity(
    { id: auth.organizerProfile.id, userId: auth.organizerProfile.userId },
    {
      docType: String(b.docType ?? ""),
      fullName: typeof b.fullName === "string" ? b.fullName : "",
      documentNumber: typeof b.documentNumber === "string" ? b.documentNumber : "",
      address: typeof b.address === "string" ? b.address : "",
      frontPath: b.frontPath,
      backPath: b.backPath,
      selfiePath: b.selfiePath,
      consent: b.consent === true,
    }
  );
  if ("error" in result) {
    return NextResponse.json(
      { error: { code: result.error, message: result.message ?? MESSAGES[result.error] ?? "Couldn't submit." } },
      { status: result.error === "not_configured" ? 503 : 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
