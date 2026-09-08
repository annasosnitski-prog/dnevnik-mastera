# Шаг 1 — слой данных: соединение, репозитории, хуки

> План к первому пункту разбора «Куда расти ИНКЕ». Рабочий код этим
> документом не меняется — это договор о том, что и в каком порядке
> делать, чтобы каждый следующий PR был маленьким и проверяемым.

**Статус: шаги 1–7 выполнены** (`src/storage/connection.ts`,
`TattoDiary.tsx` переключён на него, четыре репозитория —
`clientsRepo`/`projectsRepo`/`contentRepo`/`masterInfoRepo`, восстановление
и импорт бэкапа тоже переведены на них). `grep objectStore src/components`
пуст. Хуки поверх репозиториев (раздача через контекст) в этот пункт
разбора не входили — см. «Что в этом шаге НЕ делаем» ниже.

## 1. Что сейчас

Всё хранилище живёт внутри компонента `src/components/TattoDiary.tsx`
(4517 строк, 78 `useState`):

- `initDB` / `initDBWithRetry` — открытие базы `TattoDiaryDB`, 4 стора:
  `clients`, `projects`, `contentEntries`, `masterInfo` (+ стор очереди
  задач контента).
- Машинерия устойчивости, добытая в PR #278/#281 и живущая на семи `useRef`
  прямо в теле компонента: `connectDb`, `scheduleReconnect`,
  `handleConnectionLost`, `flushPendingWrites`, `withStorage`, `openTx`,
  подписки на `visibilitychange`/`pageshow`, `onclose`, `onversionchange`.
- 20 прямых вызовов `tx.objectStore(...)` и 6 вызовов `withStorage` —
  чтения (`loadClients`, `loadProjects`, `loadContentEntries`,
  `reloadMasterInfo`, `reloadContentIngestJobs`) и записи (`saveClient`,
  `deleteClient`, `saveProjects`, `deleteProject`, `saveContentEntry`,
  `deleteContentEntry`, восстановление из копии).

Следствия, ради которых всё это и разбирается:

- Любая новая сущность (мудборд, деньги, портфолио) означает ещё один
  раунд той же машинерии, скопированной руками.
- Проверить чтение/запись можно только через весь компонент, поэтому
  они почти не покрыты тестами — при 1012 зелёных тестах.
- Миграция фото в отдельное хранилище (шаг 4) сейчас — правка всего
  файла; после этого шага — правка одного слоя.

## 2. Что получается

Три уровня, каждый со своей ответственностью:

```
src/storage/connection.ts   соединение, переподключение, очередь записей
src/storage/repos/*.ts      clientsRepo, projectsRepo, contentRepo, masterInfoRepo
src/hooks/*.ts              useClients, useProjects, useContentEntries
```

**`connection.ts`** — единственный владелец `IDBDatabase`. Забирает из
компонента `initDBWithRetry`, `connectDb`, `scheduleReconnect`,
`handleConnectionLost`, `flushPendingWrites`, `withStorage`, `openTx` и
все семь `useRef` — они становятся переменными модуля. Наружу отдаёт:

```ts
connect(): void                       // и переподключение, и «Повторить» руками
read<T>(stores, action, run): Promise<T>
write(key, action, run): void         // сегодняшний withStorage, слово в слово
subscribe(fn: (phase: StoragePhase) => void): () => void
onError(fn: (source, action, error) => void): void
```

Поведение не меняется ни в одной точке: те же три тихие попытки, та же
очередь с вытеснением по ключу, те же `STORAGE_ACTIONS` в журнале.

**Репозитории** — тонкие, без React и без нормализации-в-обход-домена:

```ts
clientsRepo.list(): Promise<Client[]>          // getAll + normalizeClient
clientsRepo.save(client: Client): void
clientsRepo.remove(id: string): void
projectsRepo.list() / saveAll(projects) / remove(id)
contentRepo.list() / save(entry) / remove(id)
masterInfoRepo.get() / put(info)
```

`saveAll` у проектов, а не `save` — так пишет сегодняшний `saveProjects`,
и менять форму записи заодно с переносом нельзя.

**Хуки** — состояние + вызовы репозитория, без прокидывания `db`:

```ts
const { clients, saveClient, deleteClient, loaded } = useClients();
```

Контекст (шаг 2 разбора) в этот шаг не входит: сначала хуки живут в
`TattoDiary.tsx`, а раздача через контекст — отдельная работа.

## 3. Порядок PR

Каждый — самостоятельный, зелёный, мержится отдельно. Оценки грубые.

| # | PR | Содержание | Риск |
|---|---|---|---|
| 1 | `storage/connection` | Модуль + тесты на fake-indexeddb. Компонент **ещё не трогаем**: модуль лежит рядом, не подключён. | нет |
| 2 | Переключить компонент на `connection` | Удалить из `TattoDiary.tsx` семь рефов и шесть функций, звать модуль. Диффа много, поведения — ноль. | средний |
| 3 | `clientsRepo` + `useClients` | Первая сущность целиком: чтение, запись, удаление. | низкий |
| 4 | `projectsRepo` + `useProjects` | Самая связанная — сессии, консультации, напоминания идут через неё. | средний |
| 5 | `contentRepo` + `useContentEntries` | Плюс стор очереди задач контента. | низкий |
| 6 | `masterInfoRepo` | Мелочь, добивает последние `objectStore` в компоненте. | низкий |
| 7 | Уборка | Восстановление из копии и `backupImport` — на репозитории. Проверка: `grep objectStore src/components` пуст. | низкий |

PR 1 и 2 разделены намеренно: если переключение что-то ломает, откат —
это откат одного PR, а не потеря всего модуля.

## 4. Как проверяется

- `fake-indexeddb` уже в devDependencies и уже используется
  (`tests/storageBreakdown.test.mjs`, `tests/backupArchive.test.mjs`) —
  новой оснастки не нужно.
- На PR 1 пишутся тесты, которых сегодня нет вообще: обрыв соединения
  посреди записи → запись уходит в очередь → после переподключения
  ложится в базу; вытеснение по ключу; исчерпание попыток → `failed`.
- На PR 3–6: круг «сохранить → перечитать → удалить» на каждой сущности.
- Регресс: `npm test` (1012 тестов) обязан оставаться зелёным на каждом
  PR без правок существующих тестов. Если тест пришлось поправить —
  значит, поведение изменилось, и это повод остановиться.

## 5. Чего в этом шаге НЕ делаем

- Не меняем схему базы и не поднимаем `TATTO_DIARY_DB_VERSION`.
- Не выносим фото (это шаг 4 разбора, и он опирается на этот).
- Не трогаем `ProjectStatus`/`ProjectState` (шаг 3).
- Не вводим контекст (шаг 2).
- Не переписываем нормализацию — `normalizeClient`/`normalizeProject`
  переезжают как есть.

## 6. Главный риск

Машинерия восстановления писалась под живой сбой на телефоне мастера, и
её поведение проверено практикой, а не тестами. Перенос обязан быть
дословным: любое «заодно улучшу» здесь возвращает мигающую красную
плашку. Поэтому PR 1 — сначала тесты на нынешнее поведение, и только
потом PR 2 переключает компонент.
