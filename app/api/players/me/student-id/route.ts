// The player's stored student ID card.
//  GET    — its status (and the storage path, so the owner can open their own photo)
//  POST   — save it. Body: { path, expiresAt: "YYYY-MM-DD" | null, noExpiry: boolean, studentId?: string }
//           The browser uploads the photo itself first (private bucket, own folder).
//  DELETE — remove it (refused while a live entry still needs the photo). The
//           browser then deletes the file with the player's own login.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { banGuard } from "@/lib/services/bans";
import {
  getStudentId,
  getOwnStudentIdPath,
  saveStudentId,
  removeStudentId,
} from "@/lib/services/student-id";

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      response: NextResponse.json(
        { error: { code: "unauthenticated", message: "Sign in required." } },
        { status: 401 }
      ),
    } as const;
  }
  const banned = await banGuard(user.id);
  if (banned) return { response: banned } as const;
  return { user } as const;
}

const SAVE_ERRORS: Record<string, [number, string]> = {
  no_institute: [409, "Choose your institute first, then add your student ID."],
  bad_path: [400, "That photo upload isn't valid. Please upload it again."],
  expiry_required: [400, "Enter the expiry date on your card, or tick that it has none."],
  expiry_invalid: [400, "That date isn't valid."],
  expiry_in_past: [400, "That card has already expired. Add a card that is still valid."],
  expiry_too_far: [400, "That expiry date is too far in the future."],
  student_number_too_long: [400, "The student number is too long."],
};

export async function GET() {
  const auth = await authed();
  if ("response" in auth) return auth.response;
  const [status, path] = await Promise.all([getStudentId(auth.user.id), getOwnStudentIdPath(auth.user.id)]);
  return NextResponse.json(status ? { ...status, path } : null);
}

export async function POST(request: Request) {
  const auth = await authed();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  if (typeof body.path !== "string" || !body.path) {
    return NextResponse.json({ error: { code: "bad_path", message: SAVE_ERRORS.bad_path[1] } }, { status: 400 });
  }
  const result = await saveStudentId(auth.user.id, {
    path: body.path,
    expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null,
    noExpiry: body.noExpiry === true,
    studentId: typeof body.studentId === "string" ? body.studentId : undefined,
  });
  if ("error" in result) {
    const [status, message] = SAVE_ERRORS[result.error] ?? [400, "Couldn't save your student ID."];
    return NextResponse.json({ error: { code: result.error, message } }, { status });
  }
  return NextResponse.json(result.data, { status: 201 });
}

export async function DELETE() {
  const auth = await authed();
  if ("response" in auth) return auth.response;
  const result = await removeStudentId(auth.user.id);
  if ("error" in result) {
    if (result.error === "in_use") {
      return NextResponse.json(
        {
          error: {
            code: "in_use",
            message:
              "You can't remove your student ID while you're entered in a tournament that uses it. Remove it once those tournaments are over.",
            entries: result.entries,
          },
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: { code: "no_id", message: "You haven't added a student ID." } }, { status: 404 });
  }
  return NextResponse.json(result.data);
}
