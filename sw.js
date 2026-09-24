/* Service worker del Catastro de Grifos — el único propósito es habilitar
   que el navegador ofrezca "Agregar a pantalla de inicio" (Chrome/Android
   exige un service worker con un manejador de fetch para considerar la
   página instalable) y dar una red de seguridad mínima si se abre el
   ícono sin señal.

   OJO — decisión deliberada de diseño, por la historia de este proyecto:
   ya hubo confusión real ("no se subió/no cambió nada") por el caché HTTP
   normal de GitHub Pages (ver notas del proyecto, sección de caché). Un
   service worker mal hecho (cache-first agresivo) empeora exactamente ese
   mismo problema, porque puede servir una versión vieja indefinidamente
   aunque el usuario haga Ctrl+Shift+R. Por eso acá la estrategia es
   "red primero, caché como respaldo" (network-first): mientras haya
   señal, SIEMPRE se pide la versión real al servidor y nunca se sirve
   nada cacheado por delante de la red. El caché solo se usa si la
   petición de red falla (sin conexión). */

const CACHE_NAME = 'grifos-shell-v1';
const APP_SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Solo nos metemos en peticiones GET normales de navegación/recursos propios.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Red primero: si funcionó, se guarda una copia fresca en caché
        // (por si más tarde se abre sin señal) y se devuelve la respuesta
        // real de la red — nunca la cacheada.
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() =>
        // Sin conexión: se cae al caché (última versión que sí cargó bien).
        // Si tampoco hay nada cacheado para esa petición puntual, al menos
        // se intenta devolver el shell principal para no dejar una pantalla
        // de error del navegador.
        caches.match(event.request).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
