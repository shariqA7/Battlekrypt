// GET /api/tournaments/:id/my-entry — the signed-in person's own entry in this tournament: where it
// stands (seat, waiting list, payment due), what withdrawing would do, and other open slots.
// Signed out: an empty answer, not an error, so the tournament page can always ask.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyEntry } from "@/lib/services/my-entry";
import { refreshSeats } from "@/lib/services/rooms";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ entries: [], alternatives: [], policy: null });
  await refreshSeats(id); // release unpaid seats whose time is up, move the queue
  const view = await getMyEntry(id, user.id);
  if (!view) return NextResponse.json({ error: { code: "not_found", message: "Tournament not found." } }, { status: 404 });
  return NextResponse.json(view);
}
