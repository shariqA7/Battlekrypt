// POST /api/admin/carousel-slides — admin adds a slide
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { createCarouselSlide } from "@/lib/services/tournaments";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (!body.mediaUrl || !body.mediaType) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "mediaUrl and mediaType are required." } },
      { status: 400 }
    );
  }
  if (!["image", "video"].includes(body.mediaType)) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "mediaType must be 'image' or 'video'." } },
      { status: 400 }
    );
  }

  const slide = await createCarouselSlide({
    mediaUrl: body.mediaUrl,
    mediaType: body.mediaType,
    title: body.title,
    text: body.text,
  });

  return NextResponse.json(slide, { status: 201 });
}
