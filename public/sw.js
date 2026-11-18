/*
 * Service worker do Finance OS.
 * Regra de segurança: NUNCA guardar em cache páginas, APIs ou respostas do Supabase,
 * porque elas contêm dados financeiros. Só arquivos estáticos versionados do build
 * (/_next/static/, que têm hash no nome) e o ícone são guardados.
 */
const CACHE = "fos-static-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const isStatic =
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg");
  if (!isStatic) return; // rede direto, sem cache

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});
