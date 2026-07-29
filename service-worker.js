"use strict";

// Increment after app-shell changes so installed apps receive the latest files.
const CACHE_PREFIX = "wizard-scoreboard-";
const CACHE_NAME = `${CACHE_PREFIX}v1.0.108`;
const APP_SHELL = [
  "./",
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
  "./js/result-view.js",
  "./js/persistence-controller.js",
  "./js/setup-controller.js",
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
const OPTIONAL_APP_SHELL = [
  "./js/history-controller.js"
];
const SCOPE_URL = new URL(self.registration.scope);
const INDEX_URL = new URL("./index.html", SCOPE_URL).href;
const APP_ASSET_URLS = new Set(
  [...APP_SHELL, ...OPTIONAL_APP_SHELL].map((path) => new URL(path, SCOPE_URL).href)
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => cacheOptionalAppShell())
      .then(() => self.skipWaiting())
  );
});

async function cacheOptionalAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(OPTIONAL_APP_SHELL.map(async (path) => {
    const response = await fetch(new URL(path, SCOPE_URL).href);
    if (response.ok && response.type !== "opaque") {
      await cache.put(new URL(path, SCOPE_URL).href, response.clone());
    }
  }));
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== SCOPE_URL.origin || !requestUrl.href.startsWith(SCOPE_URL.href)) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(event.request, requestUrl));
    return;
  }

  if (!APP_ASSET_URLS.has(requestUrl.href)) return;
  event.respondWith(handleStaticAssetRequest(event.request));
});

async function handleNavigationRequest(request, requestUrl) {
  try {
    const networkResponse = await fetch(request);
    if (!networkResponse.ok) {
      return (await caches.match(INDEX_URL)) ?? networkResponse;
    }

    const isAppEntry = requestUrl.href === SCOPE_URL.href || requestUrl.href === INDEX_URL;
    const isHtml = networkResponse.headers.get("content-type")?.includes("text/html");
    if (isAppEntry && isHtml) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(INDEX_URL, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return (await caches.match(INDEX_URL)) ?? Response.error();
  }
}

// Only the fixed app shell is refreshed; future API responses remain outside this cache.
async function handleStaticAssetRequest(request) {
  try {
    const networkResponse = await fetch(request);
    if (!networkResponse.ok || networkResponse.type === "opaque") {
      return (await caches.match(request)) ?? networkResponse;
    }

    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch {
    return (await caches.match(request)) ?? Response.error();
  }
}
