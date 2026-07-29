"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const indexHtml = fs.readFileSync(require.resolve("../index.html"), "utf8");
assert.match(indexHtml, /const hadController = Boolean\(navigator\.serviceWorker\.controller\)/);
assert.match(indexHtml, /if \(!hadController \|\| isReloadingForUpdate\) return/);

const listeners = {};
const deletedCaches = [];
const cacheWrites = [];
let installedAppShell = [];
let networkHandler = async () => {
  throw new Error("No network response configured.");
};
let cachedResponse = null;

const cache = {
  async addAll(resources) {
    installedAppShell = [...resources];
  },
  async put(key, response) {
    await Promise.resolve();
    cacheWrites.push({ key, response });
  }
};

const context = vm.createContext({
  URL,
  console,
  fetch(request) {
    return networkHandler(request);
  },
  caches: {
    async open() {
      return cache;
    },
    async keys() {
      return [
        "wizard-scoreboard-v1.0.51",
        "wizard-scoreboard-v1.0.52",
        "another-application-cache"
      ];
    },
    async delete(key) {
      deletedCaches.push(key);
      return true;
    },
    async match() {
      return cachedResponse;
    }
  },
  Response: {
    error() {
      return { ok: false, status: 0, type: "error" };
    }
  },
  self: {
    registration: {
      scope: "https://example.test/wizard/"
    },
    clients: {
      async claim() {}
    },
    async skipWaiting() {},
    addEventListener(type, listener) {
      listeners[type] = listener;
    }
  }
});

vm.runInContext(
  fs.readFileSync(require.resolve("../service-worker.js"), "utf8"),
  context,
  { filename: "service-worker.js" }
);

function dispatchLifecycle(type) {
  let lifetimePromise;
  listeners[type]({
    waitUntil(promise) {
      lifetimePromise = Promise.resolve(promise);
    }
  });
  return lifetimePromise;
}

function dispatchFetch(request) {
  let responsePromise;
  listeners.fetch({
    request,
    respondWith(promise) {
      responsePromise = Promise.resolve(promise);
    }
  });
  return responsePromise;
}

function response({ ok = true, status = 200, type = "basic", contentType = "text/plain" } = {}) {
  return {
    ok,
    status,
    type,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? contentType : null;
      }
    },
    clone() {
      return response({ ok, status, type, contentType });
    }
  };
}

(async () => {
  await dispatchLifecycle("install");
  assert.ok(installedAppShell.includes("./styles.css"));
  assert.ok(installedAppShell.includes("./css/setup.css"));
  assert.ok(installedAppShell.includes("./css/game.css"));
  assert.ok(installedAppShell.includes("./css/results-history.css"));
  assert.ok(installedAppShell.includes("./css/dialogs.css"));
  assert.ok(installedAppShell.includes("./css/responsive.css"));
  assert.ok(installedAppShell.includes("./js/state-manager.js"));
  assert.ok(installedAppShell.includes("./js/ui-components.js"));
  assert.ok(installedAppShell.includes("./js/file-utils.js"));
  assert.ok(installedAppShell.includes("./js/formatters.js"));
  assert.ok(installedAppShell.includes("./js/result-view.js"));
  assert.ok(installedAppShell.includes("./js/persistence-controller.js"));
  assert.ok(installedAppShell.includes("./js/setup-controller.js"));
  assert.ok(installedAppShell.includes("./js/import-controller.js"));
  assert.ok(installedAppShell.includes("./js/game-view.js"));
  assert.ok(installedAppShell.includes("./js/round-result-view.js"));
  assert.ok(installedAppShell.includes("./js/round-controller.js"));
  assert.ok(installedAppShell.includes("./js/special-cards-controller.js"));
  assert.ok(!installedAppShell.includes("./js/history-controller.js"));

  await dispatchLifecycle("activate");
  assert.deepEqual(deletedCaches, [
    "wizard-scoreboard-v1.0.51",
    "wizard-scoreboard-v1.0.52"
  ]);

  assert.equal(dispatchFetch({
    method: "GET",
    mode: "cors",
    url: "https://cdn.example.test/library.js"
  }), undefined);

  assert.equal(dispatchFetch({
    method: "GET",
    mode: "cors",
    url: "https://example.test/another-app/app.js"
  }), undefined);

  assert.equal(dispatchFetch({
    method: "GET",
    mode: "cors",
    url: "https://example.test/wizard/api/future"
  }), undefined);

  const cssResponse = response({ contentType: "text/css" });
  networkHandler = async () => cssResponse;
  const returnedCss = await dispatchFetch({
    method: "GET",
    mode: "cors",
    url: "https://example.test/wizard/styles.css"
  });
  assert.equal(returnedCss, cssResponse);
  assert.equal(cacheWrites.length, 1);
  assert.equal(cacheWrites[0].key.url, "https://example.test/wizard/styles.css");

  cachedResponse = { source: "cached-index" };
  networkHandler = async () => response({ ok: false, status: 503, contentType: "text/html" });
  const navigationFallback = await dispatchFetch({
    method: "GET",
    mode: "navigate",
    url: "https://example.test/wizard/"
  });
  assert.equal(navigationFallback, cachedResponse);

  console.log("All service-worker tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
