// sw.js — D&D Dice Roller offline support
// Sube la versión cada vez que cambies archivos del shell para forzar refresco.
const CACHE_VERSION  = "v3";
const PRECACHE_NAME  = `ddr-precache-${CACHE_VERSION}`;
const RUNTIME_NAME    = `ddr-runtime-${CACHE_VERSION}`;

// Archivos "core" que sabemos que existen y que la app necesita desde el primer instante.
// Si alguno no existe (404), no rompe la instalación gracias a la carga individual con allSettled.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./info.html",
  "./assets/icon.png",
  "./assets/icon-192.png",
  "./assets/icon-256.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable.png",
  "./assets/wood-bg.jpg",
  "./assets/nat-text.json",
  "./engine/assets/ammo/ammo.wasm.wasm",
  "./engine/dice-box.es.min.js",
  "./engine/world.offscreen.min.js",
  "./engine/world.onscreen.min.js",
  "./engine/Dice.min.js",
  "./themes/smooth/diffuse-dark.png",
  "./themes/smooth/diffuse-light.png",
  "./themes/smooth/normal.png",
  "./themes/smooth/smoothDice.json",
  "./themes/smooth/theme.config.json",
  "./themes/amber/diffuse.jpg",
  "./themes/amber/normal.png",
  "./themes/amber/roughness.png",
  "./themes/amber/smoothDice.json",
  "./themes/amber/theme.config.json",
  "./themes/amethyst/diffuse.jpg",
  "./themes/amethyst/normal.png",
  "./themes/amethyst/roughness.png",
  "./themes/amethyst/smoothDice.json",
  "./themes/amethyst/theme.config.json",
  "./themes/aquamarine/diffuse.jpg",
  "./themes/aquamarine/normal.png",
  "./themes/aquamarine/roughness.png",
  "./themes/aquamarine/smoothDice.json",
  "./themes/aquamarine/theme.config.json",
  "./themes/diamond/diffuse.jpg",
  "./themes/diamond/normal.png",
  "./themes/diamond/roughness.png",
  "./themes/diamond/smoothDice.json",
  "./themes/diamond/theme.config.json",
  "./themes/emerald/diffuse.jpg",
  "./themes/emerald/normal.png",
  "./themes/emerald/roughness.png",
  "./themes/emerald/smoothDice.json",
  "./themes/emerald/theme.config.json",
  "./themes/onyx/diffuse.jpg",
  "./themes/onyx/normal.png",
  "./themes/onyx/roughness.png",
  "./themes/onyx/smoothDice.json",
  "./themes/onyx/theme.config.json",
  "./themes/opal/diffuse.jpg",
  "./themes/opal/normal.png",
  "./themes/opal/roughness.png",
  "./themes/opal/smoothDice.json",
  "./themes/opal/theme.config.json",
  "./themes/ruby/diffuse.jpg",
  "./themes/ruby/normal.png",
  "./themes/ruby/roughness.png",
  "./themes/ruby/smoothDice.json",
  "./themes/ruby/theme.config.json",
  "./themes/sapphire/diffuse.jpg",
  "./themes/sapphire/normal.png",
  "./themes/sapphire/roughness.png",
  "./themes/sapphire/smoothDice.json",
  "./themes/sapphire/theme.config.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE_NAME);
      // allSettled: si un archivo no existe o falla, no cancela la instalación completa.
      await Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn("No se pudo precachear:", url, err))
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== PRECACHE_NAME && key !== RUNTIME_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// Estrategia:
// - Navegación (HTML): cache-first con fallback a red, y actualiza la cache en segundo plano.
// - Todo lo demás (assets propios, y también recursos de unpkg.com como el módulo dice-box, sus web workers y el .wasm de física): cache-first + se cachea en runtime la primera vez que se piden, así una vez que el usuario jugó una vez online con todos los temas/dados que use, quedan disponibles offline.
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Evitar interferir con peticiones que no queremos cachear (ej. analytics, si las hubiera).
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstForNavigation(request));
    return;
  }

  event.respondWith(cacheFirstWithRuntimeCache(request));
});

async function networkFirstForNavigation(request) {
  const cache = await caches.open(PRECACHE_NAME);
  try {
    const fresh = await fetch(request);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request) || await cache.match("./index.html");
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirstWithRuntimeCache(request) {
  const precache = await caches.open(PRECACHE_NAME);
  const cachedPre = await precache.match(request);
  if (cachedPre) return cachedPre;

  const runtime = await caches.open(RUNTIME_NAME);
  const cachedRuntime = await runtime.match(request);
  if (cachedRuntime) return cachedRuntime;

  try {
    // no-cors permite cachear también recursos cross-origin (unpkg.com) aunque la respuesta sea "opaque" (no se puede inspeccionar, pero sí se puede servir offline).
    const response = await fetch(request);
    // Solo cacheamos respuestas válidas u opacas (opaque = cross-origin no-cors).
    if (response && (response.ok || response.type === "opaque")) {
      runtime.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Sin red y sin nada en cache: no hay nada más que hacer para este recurso.
    throw err;
  }
}
