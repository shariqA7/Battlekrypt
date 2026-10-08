// Tiny preload so the phase test scripts can resolve the "@/..." path alias:
//   ts-node --transpile-only ... -r ./alias.js scripts/phase8-1-test.ts
const Module = require("module");
const path = require("path");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.join(__dirname, request.slice(2));
  }
  return orig.call(this, request, ...rest);
};
