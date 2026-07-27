"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

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
        "wizard-scoreboard-v1.0.31",
        "wizard-scoreboard-v1.0.32",
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
  assert.ok(installedAppShell.includes("./js/state-manager.js"));

  await dispatchLifecycle("activate");
  assert.deepEqual(deletedCaches, ["wizard-scoreboard-v1.0.31"]);

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

  console.log("Alle Service-Worker-Tests wurden erfolgreich ausgeführt.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
