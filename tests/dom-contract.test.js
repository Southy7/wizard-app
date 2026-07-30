"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(projectRoot, "js", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const controllerFiles = [
  "setup-controller.js",
  "history-controller.js",
  "persistence-controller.js",
  "import-controller.js",
  "round-controller.js",
  "special-cards-controller.js"
];

const requiredIdsMatch = appSource.match(/const ids = (\[[\s\S]*?\]);\s+for \(const id of ids\)/);
assert.ok(requiredIdsMatch, "Could not find the required element list in cacheElements().");

const requiredIdGroups = [["app.js", vm.runInNewContext(requiredIdsMatch[1])]];
for (const file of controllerFiles) {
  const source = fs.readFileSync(path.join(projectRoot, "js", file), "utf8");
  const match = source.match(/const REQUIRED_ELEMENT_IDS = Object\.freeze\((\[[\s\S]*?\])\);/);
  assert.ok(match, `${file} must declare its required element IDs.`);
  requiredIdGroups.push([file, vm.runInNewContext(match[1])]);
  assert.match(source, /documentRoot\.getElementById\(id\)/, `${file} must validate its required elements.`);
}

const documentIds = [...indexHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
for (const [owner, requiredIds] of requiredIdGroups) {
  assert.equal(new Set(requiredIds).size, requiredIds.length, `${owner} must not contain duplicate required IDs.`);
  for (const id of requiredIds) {
    const occurrences = documentIds.filter((documentId) => documentId === id).length;
    assert.equal(occurrences, 1, `Required element #${id} from ${owner} must occur exactly once in index.html.`);
  }
}

assert.match(
  appSource,
  /elements\[id\] = getRequiredElement\(id\);/,
  "cacheElements() must validate every required element."
);

console.log("All DOM-contract tests passed.");
