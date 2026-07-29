"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(projectRoot, "js", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

const requiredIdsMatch = appSource.match(/const ids = (\[[\s\S]*?\]);\s+for \(const id of ids\)/);
assert.ok(requiredIdsMatch, "Could not find the required element list in cacheElements().");

const requiredIds = vm.runInNewContext(requiredIdsMatch[1]);
assert.equal(new Set(requiredIds).size, requiredIds.length, "cacheElements() must not contain duplicate IDs.");

const documentIds = [...indexHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
for (const id of requiredIds) {
  const occurrences = documentIds.filter((documentId) => documentId === id).length;
  assert.equal(occurrences, 1, `Required element #${id} must occur exactly once in index.html.`);
}

assert.match(
  appSource,
  /elements\[id\] = getRequiredElement\(id\);/,
  "cacheElements() must validate every required element."
);

console.log("All DOM-contract tests passed.");
