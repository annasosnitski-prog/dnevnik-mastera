// Шаблон сервис-воркера. Лежит НЕ в public/, потому что на этапе сборки
// (см. плагин inka-build-stamp в vite.config.ts) __BUILD_ID__ заменяется на
// идентификатор конкретной сборки и результат кладётся в dist/sw.js. Файлы из
// public/ копируются как есть, поверх сгенерированных, — поэтому шаблон здесь.
//
// Штамп нужен не для красоты: браузер ставит новый сервис-воркер только если
// байты sw.js отличаются от установленного. Пока здесь была захардкоженная
// строка, каждый деплой отдавал побайтово одинаковый файл, registration.update()
// не видел изменений, новый воркер не устанавливался и приложение на телефоне
// могло месяцами крутить старый бандл.
const BUILD_ID = '__BUILD_ID__';
// Имя кэша тоже завязано на сборку: activate ниже удаляет все кэши с другими
// именами, поэтому новый деплой заодно выбрасывает старый index.html и старые
// /assets/*, а не живёт с ними бок о бок.
const CACHE_NAME = `inka-${BUILD_ID}`;
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Предзагрузка не должна ронять установку: если сеть в этот момент
      // барахлит, addAll отклоняется целиком, воркер не активируется и
      // обновление откладывается на неопределённый срок. Кэш наполнится
      // по ходу дела через обработчик fetch.
      cache.addAll(urlsToCache).catch(() => undefined)
    )
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Vite's JS/CSS bundle filenames are content-hashed (a change in content always
// produces a new URL), and the decorative sky images never change in place —
// so unlike navigations, these never need a network round trip to check for
// something newer at the same URL. Serving them straight from cache skips
// waking the radio for a request that will return the exact same bytes.
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  );
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Проверка версии обязана видеть реальное состояние сервера, иначе она
  // сравнивала бы идентификатор сборки сама с собой из кэша и никогда не
  // сообщала бы об обновлении. Полностью пропускаем её мимо воркера.
  if (url.pathname === '/version.json') {
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation and app-shell requests (index.html, manifest.json) still need
  // network-first: this is what picks up a new deploy's reference to the
  // next set of hashed asset filenames.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Don't cache non-2xx responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        // Return cached version if network fails
        return caches.match(event.request).then((response) => {
          if (response) {
            return response;
          }
          // Return offline page or generic offline response
          return new Response('Offline - cached version not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});
