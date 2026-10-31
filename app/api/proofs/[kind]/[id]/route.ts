import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PROOF_KINDS, authorizeProofView, linkForProof, type ProofKindParam } from "@/lib/services/proof-access";

// GET /api/proofs/<kind>/<id>[?side=opener|responder&i=0]
// Opens a payment proof for someone who is allowed to see it, by redirecting to a short-lived
// link. Works as a plain link or an <img src>. kind: registration, plan_request, club_fee,
// invoice, or dispute (evidence on a payment dispute).
export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const fail = (status: number, code: string, message: string) =>
    NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });

  if (!PROOF_KINDS.includes(kind as ProofKindParam)) return fail(404, "not_found", "Not found.");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, "unauthenticated", "Sign in required.");

  const url = new URL(request.url);
  const result = await authorizeProofView({
    viewerUserId: user.id,
    kind: kind as ProofKindParam,
    id,
    side: url.searchParams.get("side"),
    index: Math.max(0, Math.min(9, Number(url.searchParams.get("i")) || 0)),
  });
  if ("error" in result) return result.error === "forbidden" ? fail(403, "forbidden", "You can't open this file.") : fail(404, "not_found", "Not found.");

  let link: string | null = null;
  try {
    link = await linkForProof(result.value);
  } catch {
    return fail(503, "not_configured", "Private files aren't set up on the server (SUPABASE_SERVICE_ROLE_KEY).");
  }
  if (!link) return fail(404, "not_found", "The file couldn't be found.");
  return NextResponse.redirect(link, { status: 302, headers: { "Cache-Control": "no-store" } });
}
