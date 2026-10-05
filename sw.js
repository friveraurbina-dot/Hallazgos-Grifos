/* Service worker del Catastro de Grifos — el único propósito es habilitar
   que el navegador ofrezca "Agregar a pantalla de inicio" (Chrome/Android
   exige un service worker con un manejador de fetch para considerar la
   página instalable) y dar una red de seguridad mínima si se abre el
   ícono sin señal.

   REGLA CLAVE (corregida el 2026-10-05): este service worker SOLO toca
   peticiones del propio sitio (la misma origin de GitHub Pages: index.html,
   manifest, íconos). NUNCA debe tocar peticiones a otros dominios —en
   especial Firestore (firestore.googleapis.com), Firebase Storage, los
   mapas ni las librerías de CDN—. La primera versión interceptaba TODAS las
   peticiones GET, incluyendo el canal de tiempo real de Firestore, y eso
   dejaba la app "congelada" mostrando hallazgos viejos (se detectó que había
   guardado más de 100 peticiones de Firestore en su caché). Ahora, para
   todo lo que no sea del propio sitio, el service worker ni siquiera
   participa: el navegador va directo a la red como si no existiera.

   Estrategia para lo propio: "red primero, caché como respaldo"
   (network-first): mientras haya señal SIEMPRE se pide la versión real al
   servidor; el caché solo se usa si la red falla (sin conexión). Así nunca
   se sirve una versión vieja de la app por delante de la red. */

const CACHE_NAME = 'grifos-shell-v2';
const APP_SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  // Borra TODOS los cachés anteriores (incluido el v1, que quedó lleno de
  // peticiones de Firestore, fotos y mapas) y toma el control de las
  // pestañas abiertas de inmediato.
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1) Solo peticiones GET.
  if (req.method !== 'GET') return;

  // 2) Solo peticiones del propio sitio. Todo lo demás (Firestore, Storage,
  //    mapas, CDN, fuentes) se deja pasar sin intervenir.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        // Red primero: si funcionó, se guarda una copia fresca (solo
        // respuestas correctas) y se devuelve la respuesta real de la red.
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() =>
        // Sin conexión: se cae al caché (última versión que sí cargó bien).
        caches.match(req).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
