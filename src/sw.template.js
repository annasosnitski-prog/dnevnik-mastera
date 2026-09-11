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
//
// Кэш предыдущей сборки удаляем НЕ сразу. Новый воркер активируется, пока у
// мастера открыта страница ПРЕДЫДУЩЕЙ сборки — а все её экраны лежат именно
// в старом кэше и на сервере под старыми именами уже не существуют. Снося
// кэш немедленно, мы ломали ровно то, что сейчас у неё на экране: первое же
// переключение экрана падало с «Importing a module script failed».
//
// Поэтому оставляем последний предыдущий кэш и убираем всё, что старше.
// Имя кэша — время сборки в 36-ричной записи (см. vite.config.ts), одной и
// той же длины, поэтому обычная сортировка строк ставит их по возрасту.
// Чужие кэши не трогаем вовсе — раньше удалялось всё подряд.
const CACHE_PREFIX = 'inka-';

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      const previous = cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .sort();
      const keepPrevious = previous[previous.length - 1];
      return Promise.all(
        previous.filter((name) => name !== keepPrevious).map((name) => caches.delete(name))
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
        // Офлайн отдаём кэш ТЕКУЩЕЙ сборки, а уже потом любой другой.
        // caches.match без имени ищет по всем кэшам подряд и первым находит
        // самый старый — а с тех пор, как кэш предыдущей сборки намеренно
        // переживает деплой (см. activate), это значило бы отдавать офлайн
        // вчерашний index.html, хотя новый давно скачан.
        return caches
          .open(CACHE_NAME)
          .then((cache) => cache.match(event.request))
          .then((fresh) => fresh || caches.match(event.request))
          .then((response) => {
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
