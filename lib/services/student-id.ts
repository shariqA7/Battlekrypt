// The player's stored student ID card: added once on the profile, reused by
// every tournament that asks for one, kept until the player removes it.
import { prisma } from "@/lib/prisma";
import { isOwnProofPath } from "@/lib/services/institutions";
import {
  studentIdStatus,
  parseIdDate,
  startOfUtcDay,
  ID_MAX_YEARS_AHEAD,
  type StudentIdStatus,
} from "@/lib/student-id-status";

export interface SaveStudentIdInput {
  path: string; // where the browser uploaded the photo: <userId>/<file> in "institution-proofs"
  expiresAt: string | null; // "YYYY-MM-DD", the card's printed date
  noExpiry: boolean; // the card has no expiry date
  studentId?: string | null; // the number on the card
}

type Err<E extends string> = { error: E };

// Entries (still alive) that point at this photo: the host needs it to review
// them, so it can't be deleted from under them.
export async function liveEntriesUsingPhoto(path: string): Promise<number> {
  return prisma.registration.count({
    where: {
      institutionProofPath: path,
      status: { in: ["pending", "approved"] },
      tournament: { status: { notIn: ["completed", "cancelled"] } },
    },
  });
}

export async function getStudentId(userId: string, now = new Date()) {
  const row = await prisma.playerInstitution.findFirst({ where: { player: { userId } } });
  if (!row) return null;
  const s = studentIdStatus(row, now);
  return {
    status: s.status as StudentIdStatus,
    expiresAt: s.expiresAt,
    daysLeft: s.daysLeft,
    uploadedAt: row.idUploadedAt,
    studentId: row.studentId,
    hasInstitute: !!row.institutionId,
  };
}

// The owner (and only the owner) may ask for the path, to open their own photo.
export async function getOwnStudentIdPath(userId: string): Promise<string | null> {
  const row = await prisma.playerInstitution.findFirst({
    where: { player: { userId } },
    select: { idImagePath: true },
  });
  return row?.idImagePath ?? null;
}

export async function saveStudentId(
  userId: string,
  input: SaveStudentIdInput,
  now = new Date()
): Promise<
  | { data: { previousPath: string | null; previousPathInUse: boolean } }
  | Err<"no_institute" | "bad_path" | "expiry_required" | "expiry_invalid" | "expiry_in_past" | "expiry_too_far" | "student_number_too_long">
> {
  const row = await prisma.playerInstitution.findFirst({ where: { player: { userId } } });
  if (!row || !row.institutionId) return { error: "no_institute" };
  if (!isOwnProofPath(input.path, userId)) return { error: "bad_path" };

  let expires: Date | null = null;
  if (!input.noExpiry) {
    if (!input.expiresAt) return { error: "expiry_required" };
    expires = parseIdDate(input.expiresAt);
    if (!expires) return { error: "expiry_invalid" };
    const today = startOfUtcDay(now);
    if (expires < today) return { error: "expiry_in_past" };
    const limit = new Date(today);
    limit.setUTCFullYear(limit.getUTCFullYear() + ID_MAX_YEARS_AHEAD);
    if (expires > limit) return { error: "expiry_too_far" };
  }

  const studentId = input.studentId === undefined ? undefined : input.studentId?.trim() || null;
  if (studentId && studentId.length > 40) return { error: "student_number_too_long" };

  const previousPath = row.idImagePath;
  await prisma.playerInstitution.update({
    where: { id: row.id },
    data: {
      idImagePath: input.path,
      idInstitutionId: row.institutionId,
      idExpiresAt: expires,
      idUploadedAt: now,
      ...(studentId !== undefined ? { studentId } : {}),
    },
  });

  const replaced = previousPath && previousPath !== input.path ? previousPath : null;
  return {
    data: {
      previousPath: replaced,
      // If the old photo is still behind a live entry, keep the file.
      previousPathInUse: replaced ? (await liveEntriesUsingPhoto(replaced)) > 0 : false,
    },
  };
}

// The player removes their ID. The caller (the browser) then deletes the file
// with the player's own login. Refused while a live entry still needs it.
export async function removeStudentId(
  userId: string
): Promise<{ data: { path: string } } | Err<"no_id"> | { error: "in_use"; entries: number }> {
  const row = await prisma.playerInstitution.findFirst({ where: { player: { userId } } });
  if (!row?.idImagePath) return { error: "no_id" };
  const entries = await liveEntriesUsingPhoto(row.idImagePath);
  if (entries > 0) return { error: "in_use", entries };
  await prisma.playerInstitution.update({
    where: { id: row.id },
    data: { idImagePath: null, idInstitutionId: null, idExpiresAt: null, idUploadedAt: null, studentId: null },
  });
  return { data: { path: row.idImagePath } };
}
