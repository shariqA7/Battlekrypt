// Pure checks for the onboarding rules (no database). Run: npx tsx scripts/onboarding-test.ts
import { aboutChecks, gamesChecks, missingAbout, needsAboutStep, styleChecks, MAX_FAVORITE_GAMES } from "../lib/onboarding-rules";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); if (!c) fails++; };
const failed = (cs: { id: string; ok: boolean }[]) => cs.filter((c) => !c.ok).map((c) => c.id).join();
const NOW = new Date("2026-10-21T00:00:00Z");

const full = { firstName: "Ayesha", lastName: "Khan", username: "ayesha_7", birthDate: new Date("2000-05-04"), country: "Pakistan", guardianEmail: null };
const social = { firstName: null, lastName: null, username: null, birthDate: null, country: null, guardianEmail: null };

// ---- which fields are still missing
ok("a password sign-up has nothing missing, so no 'about you' step", !needsAboutStep(missingAbout(full, NOW)));
ok("a social login is missing everything", Object.values(missingAbout(social, NOW)).slice(0, 4).every(Boolean));
ok("a social login doesn't need a guardian yet (age unknown)", missingAbout(social, NOW).guardianEmail === false);
ok("an adult never needs a guardian email", missingAbout({ ...full, guardianEmail: null }, NOW).guardianEmail === false);
ok("a minor with no guardian email on file needs one", missingAbout({ ...full, birthDate: new Date("2011-03-01"), guardianEmail: null }, NOW).guardianEmail === true);
ok("a minor who already gave one isn't asked again", missingAbout({ ...full, birthDate: new Date("2011-03-01"), guardianEmail: "mum@x.com" }, NOW).guardianEmail === false);
ok("a missing username alone still triggers the step", needsAboutStep(missingAbout({ ...full, username: null }, NOW)));
ok("no profile at all -> everything missing", needsAboutStep(missingAbout(null, NOW)));

// ---- about step only checks what is missing
const all = missingAbout(social, NOW);
const good = { firstName: "Sara", lastName: "Ali", username: "sara_ali", birthDate: "1999-01-01", country: "PK", guardianEmail: "" };
ok("a complete social login form passes", failed(aboutChecks(good, all, { usernameTaken: false, ownEmail: "s@x.com", now: NOW })) === "");
ok("empty form fails every missing field", failed(aboutChecks({}, all, { usernameTaken: false, now: NOW })).includes("first_name") && failed(aboutChecks({}, all, { now: NOW })).includes("country"));
ok("a taken username fails", failed(aboutChecks(good, all, { usernameTaken: true, now: NOW })) === "username_free");
ok("a reserved username fails", failed(aboutChecks({ ...good, username: "admin" }, all, { usernameTaken: false, now: NOW })) === "username_reserved");
ok("an under-13 date of birth fails", failed(aboutChecks({ ...good, birthDate: "2015-01-01" }, all, { now: NOW })) === "dob_age");
ok("a fake country code fails", failed(aboutChecks({ ...good, country: "ZZ" }, all, { now: NOW })) === "country");
ok("a 15 year old must give a guardian email", failed(aboutChecks({ ...good, birthDate: "2011-06-01" }, all, { now: NOW })) === "guardian_email");
ok("a 15 year old with a valid guardian email passes", failed(aboutChecks({ ...good, birthDate: "2011-06-01", guardianEmail: "mum@x.com" }, all, { now: NOW, ownEmail: "kid@x.com" })) === "");
ok("guardian email can't be their own", failed(aboutChecks({ ...good, birthDate: "2011-06-01", guardianEmail: "KID@x.com" }, all, { now: NOW, ownEmail: "kid@x.com" })) === "guardian_email");
const onlyUsername = { ...missingAbout(full, NOW), username: true };
ok("only the missing fields are checked", aboutChecks({ username: "new_name" }, onlyUsername, { usernameTaken: false }).every((c) => c.id.startsWith("username")));
ok("a locked field can't be re-checked into failing", failed(aboutChecks({ username: "new_name" }, onlyUsername, { usernameTaken: false })) === "");

// ---- games
const catalog = ["PUBG Mobile", "Valorant", "Chess"];
ok("known games pass", failed(gamesChecks(["Valorant", "Chess"], catalog).checks) === "");
ok("an unknown game fails and is dropped from the value", failed(gamesChecks(["Valorant", "Nope"], catalog).checks) === "games_known" && gamesChecks(["Valorant", "Nope"], catalog).value.join() === "Valorant");
ok("duplicates collapse", gamesChecks(["Chess", "Chess", " Chess "], catalog).value.length === 1);
ok("more than the maximum fails", failed(gamesChecks(Array.from({ length: MAX_FAVORITE_GAMES + 1 }, (_, i) => `G${i}`), Array.from({ length: 20 }, (_, i) => `G${i}`)).checks) === "games_count");
ok("exactly the maximum passes", failed(gamesChecks(Array.from({ length: MAX_FAVORITE_GAMES }, (_, i) => `G${i}`), Array.from({ length: 20 }, (_, i) => `G${i}`)).checks) === "");
ok("non-array input is treated as none", gamesChecks("Valorant", catalog).value.length === 0 && failed(gamesChecks(null, catalog).checks) === "");
ok("an empty pick is fine (skippable)", failed(gamesChecks([], catalog).checks) === "");

// ---- play style, gender, hobbies
ok("all three answers pass", failed(styleChecks({ playStyle: "competitive", gender: "female", hobbies: "chess" }).checks) === "");
ok("everything may be left blank", failed(styleChecks({}).checks) === "" && styleChecks({}).value.playStyle === null);
ok("an unknown play style fails", failed(styleChecks({ playStyle: "tryhard" }).checks) === "play_style" && styleChecks({ playStyle: "tryhard" }).value.playStyle === null);
ok("an unknown gender fails", failed(styleChecks({ gender: "xyz" }).checks) === "gender");
ok("hobbies over 200 characters fail", failed(styleChecks({ hobbies: "a".repeat(201) }).checks) === "hobbies");
ok("hobbies are trimmed and control characters stripped", styleChecks({ hobbies: "  chess\u0000 \u0007music  " }).value.hobbies === "chess music");

console.log(fails ? `\n${fails} FAILED` : "\nAll passed");
process.exit(fails ? 1 : 0);
