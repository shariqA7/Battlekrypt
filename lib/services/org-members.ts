import { prisma } from "@/lib/prisma";
import type { OrgMemberRole } from "@prisma/client";

export async function listMembers(organizerId: string) {
  return prisma.organizationMember.findMany({
    where: { organizerId },
    orderBy: { createdAt: "asc" },
  });
}

export async function addMember(
  organizerId: string,
  input: { email: string; name?: string; role: OrgMemberRole }
) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "invalid_email" as const };

  const owner = await prisma.organizerProfile.findUnique({
    where: { id: organizerId },
    include: { user: { select: { email: true } } },
  });
  if (!owner) return { error: "not_found" as const };
  if (owner.user.email?.toLowerCase() === email) return { error: "is_owner" as const };

  const existing = await prisma.organizationMember.findUnique({
    where: { organizerId_email: { organizerId, email } },
  });
  if (existing) return { error: "already_member" as const };

  // Link to an account if that email already has one.
  const account = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });

  const member = await prisma.organizationMember.create({
    data: {
      organizerId,
      email,
      name: input.name?.trim() || null,
      role: input.role,
      userId: account?.id ?? null,
    },
  });
  return { data: member };
}

export async function removeMember(organizerId: string, memberId: string) {
  const member = await prisma.organizationMember.findUnique({ where: { id: memberId } });
  if (!member || member.organizerId !== organizerId) return { error: "not_found" as const };
  await prisma.organizationMember.delete({ where: { id: memberId } });
  return { data: { id: memberId } };
}
