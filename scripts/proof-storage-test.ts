// Private proof rules: what a stored proof may look like and whose it is. Pure.
import { isPrivateProofPath, normalizeProofInput, ownsProofPath, proofPathOwner, publicUrlToPath } from "../lib/proof-storage";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const uid = "3f2b8c1e-1111-4222-8333-444455556666";
const other = "9a9a9a9a-2222-4333-8444-555566667777";
const mine = `${uid}/payment-proofs/0b1c2d3e-aaaa-4bbb-8ccc-ddddeeeeffff.png`;

ok("the app's own path shape is recognised", isPrivateProofPath(mine) && proofPathOwner(mine) === uid);
ok("odd shapes are not private paths", !isPrivateProofPath("https://x/y.png") && !isPrivateProofPath("../../etc/passwd") && !isPrivateProofPath(`${uid}/payment-proofs/a.b.png`) && !isPrivateProofPath(`${uid}//x.png`) && !isPrivateProofPath(""));
ok("a path in your own folder is yours", ownsProofPath(mine, uid));
ok("a path in someone else's folder is not yours", !ownsProofPath(mine, other));
ok("you can submit your own private path", normalizeProofInput(mine, uid) === mine);
ok("you can NOT submit someone else's path (it would show you their file)", normalizeProofInput(mine, other) === null);
ok("a path with no signed-in owner is refused", normalizeProofInput(mine, null) === null);
ok("an old public link is still accepted", normalizeProofInput("https://x.supabase.co/storage/v1/object/public/tournament-assets/a.png", uid) !== null);
ok("junk, empty and oversized values are refused", normalizeProofInput("not a path", uid) === null && normalizeProofInput("", uid) === null && normalizeProofInput(42, uid) === null && normalizeProofInput("https://x/" + "a".repeat(1000), uid) === null);
ok("a traversal attempt is refused", normalizeProofInput(`${uid}/../${other}/payment-proofs/0b1c2d3e-aaaa-4bbb-8ccc-ddddeeeeffff.png`, uid) === null);

const base = "https://abc.supabase.co";
ok("a public link maps back to its storage path", publicUrlToPath(`${base}/storage/v1/object/public/tournament-assets/payment-proofs/x%20y.png?t=1`, base, "tournament-assets") === "payment-proofs/x y.png");
ok("a link into another bucket or site does not map", publicUrlToPath(`${base}/storage/v1/object/public/other/a.png`, base, "tournament-assets") === null && publicUrlToPath("https://evil.example/a.png", base, "tournament-assets") === null && publicUrlToPath(`${base}/x`, undefined, "tournament-assets") === null);

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log("\nall passed");
