// /s/<series-slug>: the evergreen link an organizer posts once on WhatsApp or anywhere else. It always
// opens the next session that is still taking sign-ups (or the series page if there is none).
import { NextResponse } from "next/server";
import { nextOpenSessionSlug } from "@/lib/services/scrim-series";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const next = await nextOpenSessionSlug(slug).catch(() => null);
  return NextResponse.redirect(new URL(next ? `/tournaments/${next}` : `/scrims/${slug}`, request.url), 302);
}
