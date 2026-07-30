"use strict";

// Bump this version with each app-shell release so installed clients receive a coherent update.
const CACHE_PREFIX = "wizard-scoreboard-";
const CACHE_NAME = `${CACHE_PREFIX}v1.1.0-r16`;
const APP_SHELL = [
  "./index.html",
  "./styles.css",
  "./css/setup.css",
  "./css/game.css",
  "./css/results-history.css",
  "./css/dialogs.css",
  "./css/responsive.css",
  "./js/game-logic.js",
  "./js/state-manager.js",
  "./js/storage.js",
  "./js/ui-components.js",
  "./js/file-utils.js",
  "./js/formatters.js",
  "./js/game-statistics.js",
  "./js/result-view.js",
  "./js/persistence-controller.js",
  "./js/setup-controller.js",
  "./js/history-controller.js",
  "./js/import-controller.js",
  "./js/game-view.js",
  "./js/round-result-view.js",
  "./js/round-controller.js",
  "./js/special-cards-controller.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./assets/icons/favicon-32.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png"
];
const SCOPE_URL = new URL(self.registration.scope);
const INDEX_URL = new URL("./index.html", SCOPE_URL).href;
const APP_ASSET_URLS = new Set(APP_SHELL.map((path) => new URL(path, SCOPE_URL).href));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients
      .claim()
      .then(() => caches.keys())
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  // This worker owns only same-origin requests inside its registration scope.
  if (requestUrl.origin !== SCOPE_URL.origin || !requestUrl.href.startsWith(SCOPE_URL.href)) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(event.request));
    return;
  }

  if (!APP_ASSET_URLS.has(requestUrl.href)) return;
  event.respondWith(handleStaticAssetRequest(event.request));
});

async function handleNavigationRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(INDEX_URL);
  if (cachedResponse) return cachedResponse;

  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch {
    return Response.error();
  }
}

async function handleStaticAssetRequest(request) {
  // Keep the installed version immutable; a new worker switches the entire shell at once.
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    return await fetch(request);
  } catch {
    return Response.error();
  }
}
