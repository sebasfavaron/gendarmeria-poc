/*
 * Service worker: guarda la app en el celular para que se pueda volver a abrir sin conexión.
 * Red primero (así llegan los cambios); si no hay red o tarda más de 3 s, usa lo guardado.
 * Solo funciona servido por https (o localhost); abierto como archivo no se registra.
 */
const CACHE = 'gendarmeria-poc-v1';
const FILES = ['./', 'index.html', 'styles.css', 'escenario.js', 'caso.js', 'main.js', 'vendor/three.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const cached = () => caches.match(req, { ignoreSearch: true });
  const net = fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  });
  const slow = new Promise(r => setTimeout(r, 3000)).then(cached).then(c => c || net);
  e.respondWith(Promise.race([net.catch(cached), slow]));
});
