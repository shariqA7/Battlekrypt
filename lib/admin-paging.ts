// Cursor paging shared by the admin search boxes and lists (users, organizations,
// clubs). A search returns 10 rows at first, and the next 10 each time the admin
// scrolls to the bottom: the client sends back the `nextCursor` it was given.
export const ADMIN_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

export type PageQuery = { q: string; cursor: string | null; limit: number };
export type Page<T> = { items: T[]; nextCursor: string | null };

export function parsePageQuery(url: string): PageQuery {
  const sp = new URL(url).searchParams;
  const limit = Math.floor(Number(sp.get("limit")));
  return {
    q: (sp.get("q") ?? "").trim().slice(0, 100),
    cursor: sp.get("cursor") || null,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_PAGE_SIZE) : ADMIN_PAGE_SIZE,
  };
}

// Rows fetched with `take: limit + 1`: the extra row only says "there is more".
export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
}

// Prisma arguments for continuing after `cursor`.
export function cursorArgs(cursor: string | null): { cursor?: { id: string }; skip?: number } {
  return cursor ? { cursor: { id: cursor }, skip: 1 } : {};
}
