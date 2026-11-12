// Image shrinking rules that do not need a browser. Pure.
import { PRESETS, fitWithin, outputName, presetForBucket, safeFileName } from "../lib/image-compress";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

const big = fitWithin(4000, 3000, 1600);
ok("a big landscape picture is scaled to fit, keeping its shape", big.width === 1600 && big.height === 1200 && big.scaled);
const tall = fitWithin(3000, 4000, 1600);
ok("a big portrait picture is scaled by its long side", tall.width === 1200 && tall.height === 1600 && tall.scaled);
const small = fitWithin(800, 600, 1600);
ok("a small picture is never enlarged", small.width === 800 && small.height === 600 && !small.scaled);
const exact = fitWithin(1600, 900, 1600);
ok("a picture exactly at the limit is left alone", exact.width === 1600 && !exact.scaled);
ok("sizes never reach zero", fitWithin(5000, 1, 100).height === 1);

ok("odd characters in a file name become dashes", safeFileName("my photo (1)#.PNG") === "my-photo-1-.PNG");
ok("a name that is all symbols still gives a usable name", safeFileName("///") === "file");
ok("the output name follows the new format", outputName("Holiday Photo.JPG", "image/webp") === "Holiday-Photo.webp" && outputName("a.png", "image/jpeg") === "a.jpg" && outputName("a.webp", "image/png") === "a.png");
ok("a name with no extension still works", outputName("screenshot", "image/webp") === "screenshot.webp");
ok("output names are lowercase-extension and path safe", /^[A-Za-z0-9._-]+\.(webp|jpg|png)$/.test(outputName("we ird/na\\me?.jpeg", "image/webp")));

ok("payment-proof bucket gets the proof preset", presetForBucket("payment-proofs") === "proof");
ok("ID document and student card buckets get the id preset", presetForBucket("identity-documents") === "id" && presetForBucket("institution-proofs") === "id");
ok("every other bucket gets the photo preset", presetForBucket("tournament-assets") === "photo" && presetForBucket("anything") === "photo");
ok("proofs under 1.5 MB are left untouched so duplicate detection keeps matching the exact file", PRESETS.proof.skipBelowBytes === 1_500_000);
ok("logos keep transparency", PRESETS.logo.keepTransparency === true && !PRESETS.photo.keepTransparency);
ok("avatars are small", PRESETS.avatar.maxDimension <= 512);

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log("\nAll image-compress checks passed.");
