// scripts/download-game-images.ts
// Downloads the cover image and gallery images of every game into game-images/<game-slug>/
// Run: npx tsx scripts/download-game-images.ts
import { config } from "dotenv";
config({ path: ".env.local" });
config(); // also reads .env if present

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = "game-images";

async function save(url: string, file: string) {
    const res = await fetch(url);
    if (!res.ok) {
        console.warn("FAILED", res.status, url);
        return;
    }
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

async function main() {
    // Loaded here (not at the top) so DATABASE_URL is already set when the client connects.
    const { prisma } = await import("../lib/prisma");

    try {
        const games = await prisma.game.findMany({
            select: { name: true, slug: true, coverImageUrl: true, images: true },
        });

        let total = 0;
        for (const g of games) {
            const dir = path.join(
                OUT,
                g.slug ?? g.name.replace(/[^\w-]+/g, "-").toLowerCase()
            );

            const urls = [
                ...(g.coverImageUrl ? [{ u: g.coverImageUrl, n: "cover" }] : []),
                ...g.images.map((u, i) => ({
                    u,
                    n: `gallery-${String(i + 1).padStart(2, "0")}`,
                })),
            ];
            if (!urls.length) continue;

            await mkdir(dir, { recursive: true });
            for (const { u, n } of urls) {
                const ext = path.extname(new URL(u).pathname) || ".jpg";
                await save(u, path.join(dir, n + ext));
            }
            total += urls.length;
            console.log(`${g.name}: ${urls.length} image(s)`);
        }
        console.log(`Done. ${total} image(s) saved in ./${OUT}`);
    } finally {
        await prisma.$disconnect();
    }
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });