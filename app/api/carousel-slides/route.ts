// GET /api/carousel-slides — public, powers the auth page carousel
import { NextResponse } from "next/server";
import { listCarouselSlides } from "@/lib/services/tournaments";

export async function GET() {
  const slides = await listCarouselSlides();
  return NextResponse.json({ data: slides });
}
