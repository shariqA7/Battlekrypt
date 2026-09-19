// POST /api/tournaments/:id/status — organizer transitions tournament status
// (published -> registration_open -> registration_closed -> in_progress -> completed)
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { updateTournamentStatus } from "@/lib/services/tournaments";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const auth = await requireOrganizer();
    if ("response" in auth) return auth.response;

    const body = await request.json().catch(() => ({}));
    if (!body.status) {
        return NextResponse.json(
            { error: { code: "validation_error", message: "status is required." } },
            { status: 400 }
        );
    }

    const result = await updateTournamentStatus(id, auth.organizerProfile.id, body.status);

    if (result.error === "not_found") {
        return NextResponse.json(
            { error: { code: "not_found", message: "Tournament not found." } },
            { status: 404 }
        );
    }
    if (result.error === "forbidden") {
        return NextResponse.json(
            { error: { code: "forbidden", message: "You don't own this tournament." } },
            { status: 403 }
        );
    }
    if (result.error === "invalid_transition") {
        return NextResponse.json(
            {
                error: {
                    code: "invalid_transition",
                    message: `Can't move to "${body.status}" from the current status.`,
                    allowed: result.allowed,
                },
            },
            { status: 409 }
        );
    }

    return NextResponse.json(result.data);
}
