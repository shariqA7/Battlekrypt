// The per-channel on/off switches (pure rules). Run alone with: npx tsx scripts/payment-channels-test.ts
import { CHANNELS, isChannelKey, leavesNoWayToPay, resolveStates } from "../lib/payment-channels";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };

const defaults = resolveStates([]);
ok("with nothing saved, manual is on and NOWPayments is off", defaults.manual === true && defaults.nowpayments === false);
ok("a saved switch overrides the default", resolveStates([{ key: "nowpayments", enabled: true }, { key: "manual", enabled: false }]).nowpayments === true && resolveStates([{ key: "manual", enabled: false }]).manual === false);
ok("an unknown saved key is ignored", Object.keys(resolveStates([{ key: "mystery", enabled: true }])).sort().join() === CHANNELS.map((c) => c.key).sort().join());
ok("only real channels are accepted", isChannelKey("manual") && isChannelKey("nowpayments") && !isChannelKey("paypal") && !isChannelKey(undefined));
ok("every channel has its own switch and a description", CHANNELS.every((c) => c.label && c.description) && new Set(CHANNELS.map((c) => c.key)).size === CHANNELS.length);

const ready = { manual: true, nowpayments: true };
ok("turning off manual while NOWPayments is on and ready is safe", !leavesNoWayToPay({ manual: true, nowpayments: true }, ready, "manual", false));
ok("turning off the only enabled channel leaves no way to pay", leavesNoWayToPay({ manual: true, nowpayments: false }, ready, "manual", false));
ok("a gateway that is on but not ready doesn't count", leavesNoWayToPay({ manual: true, nowpayments: true }, { manual: true, nowpayments: false }, "manual", false));
ok("turning a channel on never leaves no way to pay when it is ready", !leavesNoWayToPay({ manual: false, nowpayments: false }, ready, "manual", true));
ok("turning on a channel that isn't ready still leaves no way to pay", leavesNoWayToPay({ manual: false, nowpayments: false }, { manual: true, nowpayments: false }, "nowpayments", true));

if (fails) { console.log(`${fails} failed`); process.exit(1); }
console.log("all passed");
