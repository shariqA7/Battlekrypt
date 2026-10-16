// Pure checks for lib/age.ts (no database). Run: npx tsx scripts/age-test.ts
import { ageOn, parseBirthDate, latestAllowedBirthDate, isAgeRequirement } from "../lib/age";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const now = d("2026-10-15");

// parsing
ok("valid date parses", parseBirthDate("2010-05-20", now)?.toISOString().startsWith("2010-05-20") === true);
ok("rejects 31 Feb", parseBirthDate("2010-02-31", now) === null);
ok("rejects 29 Feb in a non-leap year", parseBirthDate("2011-02-29", now) === null);
ok("accepts 29 Feb in a leap year", parseBirthDate("2012-02-29", now) !== null);
ok("rejects a future date", parseBirthDate("2026-10-16", now) === null);
ok("accepts today", parseBirthDate("2026-10-15", now) !== null);
ok("rejects before 1900", parseBirthDate("1899-12-31", now) === null);
ok("rejects bad shapes", ["", "2010/05/20", "20-05-2010", "2010-5-2", "abc"].every((s) => parseBirthDate(s, now) === null));

// age maths around the 13 / 16 / 18 lines
ok("turns 13 today -> 13", ageOn(d("2013-10-15"), now) === 13);
ok("turns 13 tomorrow -> 12", ageOn(d("2013-10-16"), now) === 12);
ok("turned 13 yesterday -> 13", ageOn(d("2013-10-14"), now) === 13);
ok("turns 18 today -> 18", ageOn(d("2008-10-15"), now) === 18);
ok("turns 18 next month -> 17", ageOn(d("2008-11-15"), now) === 17);
ok("birthday earlier in the year -> already had it", ageOn(d("2010-01-02"), now) === 16);
ok("leap-day birthday: 28 Feb of a non-leap year hasn't had it yet", ageOn(d("2012-02-29"), d("2026-02-28")) === 13);
ok("leap-day birthday: 1 Mar has had it", ageOn(d("2012-02-29"), d("2026-03-01")) === 14);

// the date input's max
ok("latest allowed birth date is exactly 13 years ago", latestAllowedBirthDate(now) === "2013-10-15");
ok("that date is 13, the day after is not", ageOn(d(latestAllowedBirthDate(now)), now) === 13 && ageOn(d("2013-10-16"), now) === 12);

// requirement values
ok("only 13/16/18 are valid requirements", [13, 16, 18].every(isAgeRequirement) && ![12, 14, 17, 21, "18", null].some(isAgeRequirement));

process.exit(fails ? 1 : 0);
