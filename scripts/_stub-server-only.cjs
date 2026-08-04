/**
 * Preload shim for running `src/` modules under plain tsx.
 *
 * `server-only` / `client-only` are not real packages — Next aliases them
 * during the build. Outside Next they fail to resolve, so point both at
 * this file, which exports an empty object and is already in the require
 * cache as a preload.
 *
 * Usage: npx tsx --require ./scripts/_stub-server-only.cjs <script>
 */
const Module = require("module");

const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only" || request === "client-only") return __filename;
  return original.call(this, request, ...rest);
};

module.exports = {};
