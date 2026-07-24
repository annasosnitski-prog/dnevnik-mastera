# TECH_REFACTOR_AUDIT — «Дневник мастера»

Технический аудит `src/components/TattoDiary.tsx` перед точечным рефакторингом
(вынос типов/селекторов, слой напоминаний). **Рабочий код этим документом не
меняется.** Все ссылки на строки — по состоянию `main` на момент аудита
(файл: 13 672 строки).

Стек фактически: React 18 + TypeScript + Vite, клиентское PWA, IndexedDB
(`TattoDiaryDB`, version 2), плюс несколько ключей `localStorage`. Серверной
части нет. Есть три вспомогательных модуля в `src/lib/`: `calendarSync.ts`,
`contentSync.ts`, `imagePreview.ts`. Весь остальной код (типы, данные, вся
бизнес-логика, все экраны, все формы) — в одном файле `TattoDiary.tsx`.

---

## 1. Карта файла: блоки, диапазоны, риск переноса

Размер оценён по диапазону строк. «Чистый» = не трогает React state и
хранилище, принимает данные аргументами. Риск переноса: **низкий** (чистая
функция/тип, самодостаточно), **средний** (зависит от общих констант или
вызывается из многих мест), **высокий** (завязано на состояние App / порядок
инициализации / IndexedDB).

### 1.1 Дизайн-константы и палитры — строки 30–131 (~100 строк)
`COLORS`, `ACCENT_COLORS`, `MARKER_COLORS`, `CLOUD_SOURCES`,
`AVIATION_SOURCES`, `SKIN_TONES`, `DURATIONS`, `STYLES` и пр.
Типы: локальные. Состояние: нет. Зависит от: —. Зависят от него: почти весь UI.
Выносимо без изменения поведения: **да** (в `constants/` или `theme.ts`).
Риск: **низкий**, но трогает пол-файла импортами → делать отдельным коммитом.

### 1.2 Доменные типы и их константы — строки 133–448 (~315 строк)
`UrgencyKey`/`URGENCY`/`LEGACY_URGENCY_MAP`; `ContentEntry`; `Session`;
`ClientDocument`; `ClientNote`; `ChatPlatform`/`ChatLink`/`PLATFORM_LABELS`/
`CHAT_PLATFORM_DOMAINS`; `buildChatLink()`; `ClientType`/`CLIENT_TYPES`;
`ClientLanguage`/`CLIENT_LANGUAGES`; `Client`; `Consultation`;
`ProjectCategory`/`PROJECT_CATEGORIES`; `ProjectStage`/`ProjectState`/
`ProjectWaitingFor`/`ProjectPriority` + их label-массивы; `Project`;
`clientStyles`/`stylesLabel`.
Состояние: нет. Зависят от него: **всё**. Выносимо: **да** — это и есть цель PR 2.
Риск: **низкий** (типы стираются при компиляции; значения — чистые массивы).
Единственная не-тип функция здесь — `buildChatLink()` (чистая, риск низкий).

### 1.3 Утилиты дат/цвета/строк — строки 464–595 (~130 строк)
`MONTHS_RU`, `ISO_DATE_RE`, `formatDate()`, `WEEKDAYS_SHORT_RU`,
`dateParts()`, `hexToRgba()`, `RTL_RE` + связанные, `SortMode`/`SORT_MODES`.
Плюс мелкий компонент `UpcomingDateBadge` (496–528) — **это React-компонент,
не утилита**, переносить отдельно.
Чистые: `formatDate`, `dateParts`, `hexToRgba`. Риск: **низкий** → `utils/dates.ts`.

### 1.4 Селекторы и агрегации (чистые) — строки 596–864 (~270 строк)
`todayISO()`, `sessionSortKey()`, `sortClients()`, `mostUsedStyle()`,
`UpcomingItem`/`upcomingItems()`, `notesUrgencyCounts()`, `urgencyCounts()`,
`daysSinceISO()`, `HEALING_REMINDER_DAYS`, `CLIENT_LOCALE`, `REMINDER_TEXTS`,
`healingReminderMessage()`, `localizedWhen()`, `OverdueItem`/`overdueEntries()`,
`HealingItem`/`healingReminders()`, `UpcomingSoonItem`/`upcomingSoonReminders()`,
`overdueProjects()`, `overdueReminderKey()`/`healingReminderKey()`/
`soonReminderKey()`/`projectReminderKey()`, `soonReminderMessage()`.
**Все чистые**: получают `clients`/`projects` аргументом, ничего не мутируют, не
трогают React/IndexedDB. Зависят от него: экраны «Сегодня», «Планнер», «Мастер»,
`RemindersSection`, бейдж тулбара.
Выносимо: **да** — цель PR 3 (селекторы) и ядро reminder-движка (PR 4).
Риск: **низкий**. Важно: `calendarSync.ts` их **не** использует.

### 1.5 Нормализация из IndexedDB — строки 866–1020 (~155 строк)
`readInitialDismissedReminders()` (localStorage), `normalizeSession()`,
`normalizeClient()`, `normalizeProject()`.
Чистые (кроме чтения localStorage в первой): преобразуют «сырую» запись в
полный объект с дефолтами. Зависят от: доменных типов. **Критичны для
обратной совместимости данных** — трогать нормализацию нельзя, только вынести
как есть. Риск: **средний** (легко сломать форму старых записей, если менять).

### 1.6 initDB и схема IndexedDB — строки 1002–1020
`initDB()` — открывает `TattoDiaryDB` version 2, создаёт сторы `clients`,
`projects`, `contentEntries` (все `keyPath: 'id'`). Риск: **средний** (единая
точка схемы; выносится в `data/db.ts`, но версию/сторы не трогать).

### 1.7 Декоративщина: звёзды, облака, авиация, игры — строки 1022–1776, 4012–4673
Фон (`StarfieldBackground`, `CloudsBackground`, `AviationBackground`),
празднования (`CelebrationBurst`, `runMilestoneShow`), мини-игры
(`RPSGame`, `CupsGame`, `BlackjackGame`, `TrialGate`) — ~1400 строк суммарно.
Самодостаточные React-компоненты, почти без связи с доменом. Выносимо: **да**,
но продуктовой ценности ноль. Риск: **низкий**. Кандидат на поздний вынос
(разгрузить файл), не приоритет.

### 1.8 Общие мелкие UI-компоненты и хелперы форм — строки 1780–1830, 8782–8940, 11449–11536
`SheetStarDivider`, `FieldLabel`, `INPUT_STYLE`, `SUBMIT_STYLE`,
`MetaLabel`/`MetaValue`, `SectionDivider`/`SectionHeader`, `SkinTonePalette`,
`MarkerColorPalette`, `ClientTypeToggle`, `StyleChips`, `BottomSheet`,
`SheetCloseButton`, `SheetEditButton`, `SheetSavedCheck`, `UrgencyChips`,
`ProjectCategoryChips`, `ViewField`, `SectionHeader`.
Переиспользуемые презентационные примитивы. Выносимо: **да** (`ui/`). Риск:
**низкий**. Хороший ранний вынос после типов.

### 1.9 Prefs / Theme / MasterInfo (localStorage-состояние) — строки 1831–1976
`Theme`/`readInitialTheme`/`applyTheme`; `Prefs`/`DEFAULT_PREFS`/
`readInitialPrefs`; `MasterLink`/`MasterInfo`/`DEFAULT_MASTER_INFO`/
`readInitialMasterInfo`.
Читают/пишут `localStorage` напрямую. Выносимо: **да** (`data/prefs.ts`,
`data/masterInfo.ts`). Риск: **средний** (ключи localStorage — контракт данных).

### 1.10 Корневой компонент App = `TattoDiary()` — строки 1977–4010 (~2035 строк)
**Монолит.** Содержит:
- всё состояние приложения (~50 `useState`, строки 1978–2205): `clients`,
  `projects`, `contentEntries`, `db`, `theme`, `prefs`, `masterInfo`,
  `calendarSync`, `contentSync`, `dismissedReminders`, навигация (`screen`,
  `selectedId`, `activeTab`), десятки флагов открытия форм/шитов и preset-id;
- **весь слой доступа к данным** (2212–2376): `loadClients`, `loadProjects`,
  `saveProject`, `deleteProject`, `loadContentEntries`, `saveContentEntry`,
  `deleteContentEntry`, `saveClient` (единственная воронка, дёргает
  `diffAndSync`), `deleteClient`, `replaceAllData` (импорт), `importClients`;
- **всю доменную бизнес-логику** (2500–2915): `handleAddConsultation`,
  `handleAddProject`, `handleAddProjectSession`, `migrateRecordsIntoProjects`,
  `reassignEntryProject`, `advanceProjectStage`, `upsertNote`, `deleteNote`,
  `updateSessionPhotos`, `toggleSessionDone`, `markEntryCancelled`,
  `handleAddSession` и др.;
- агрегации напоминаний перед рендером (2925–2929): `visibleOverdue`,
  `visibleHealing`, `visibleSoon`, `visibleDueProjects`;
- гигантский JSX-рендер (2934–4010): роутинг экранов + все шиты/модалки.
Выносимо: **по частям, осторожно**. Риск: **высокий** — это ядро. Порядок:
сначала вынести отсюда чистое (уже вынесено в 1.4), затем слой данных в
хуки/модуль, только потом экраны.

### 1.11 Экраны — крупные компоненты
- `WorkshopScreen` 5225–5385 (Мастерская, список проектов). Риск: средний.
- `AdminDashboardScreen` 6088–6481 (Задачи/Сводка-админка; здесь `handleExport`
  6163 и `handleImportFile` 6173 — **полный бэкап**). Риск: средний.
- `MasterDashboardScreen` 6541–7214 (экран «Мастер», брони бота, напоминания).
  Риск: средний.
- `SettingsScreen` 7352–7552 (настройки, миграция, синк). Риск: средний.
- `SummaryScreen` 7553–7924 (**Планнер**: `plannedItems`, `dueProjects`, задачи
  в две колонки general/work). Риск: средний.
- `DetailScreen` 8069–8466 (карточка клиента; `handleExportClient` 8153,
  второй `handleImportFile` 8178 — **бэкап одного клиента**). Риск: средний.
- `ContentINKAScreen` 10811–11078, `ContentPanel` 11079–11319,
  `TimelineViewSheet` 11320–11448 (contentINKA — **не трогаем по ограничениям**).
Экраны выносить последними, каждый — через props (данные + колбэки), без
общего Context со всем состоянием.

### 1.12 Формы и шиты — строки 11897–13672 (~1775 строк)
`NewClientSheet`, `EditClientSheet`, `NewSessionSheet`, `AddChoiceSheet`,
`WorkshopCreateChoiceSheet`, `ProjectSessionPickerSheet`,
`ClientKindChoiceSheet`, `ClientPickerSheet`, `QuickClientSheet`,
`NewConsultationSheet`, `ProjectViewSheet`, `NewProjectSheet`,
`CalendarSheet` + `collectCalendarEvents`/`CalendarEvent` (11543–11583).
Каждая форма — со своим локальным состоянием, получает данные/колбэки props.
Выносимо: **да**, по одной. Риск: **средний** (много props, легко забыть один).

---

## 2. Ответы на контрольные вопросы

**1. Где физически хранятся Session.**
Внутри `Client.sessions[]` (стор `clients` в IndexedDB). Плюс — «сессии без
клиента» в `Project.sessions[]` (стор `projects`), для проектов без `clientId`
(Этап 3b-доп.). При привязке клиента к такому проекту сессии переезжают в
`client.sessions` с тем же `projectId`. Отдельного стора сессий нет.

**2. Где физически хранятся Consultation.**
Только внутри `Client.consultations[]` (стор `clients`). Аналога «консультаций
без клиента» на проекте нет.

**3. Является ли `projectId` единственным источником связи.**
Да. Связь записи с проектом — исключительно поле `projectId` на
`Session`/`Consultation`/`ClientNote` (link-подход). Физического переноса нет,
обратной ссылки-массива на проекте (кроме `Project.sessions` для безклиентских)
нет. `projectId` **намеренно не входит** в ключ синка календаря
(`calendarSync.ts`), поэтому привязка проекта не дёргает Инка-календарь.

**4. Где создаются и изменяются Task.**
Task = `ClientNote` (нет отдельного типа Task). Живёт двумя способами:
`Client.notes[]` (задачи клиента) и `masterInfo.notes[]` (свои задачи мастера
без клиента, хранятся в `localStorage` ключ `inka-master-info`, **не** в
IndexedDB). Создание/изменение: `upsertNote()` / `deleteNote()` (2716–2729,
через `saveClient`) для клиентских; для мастерских — прямой `setMasterInfo(...)`
в местах вызова (напр. 3499–3510). Поле `projectId` добавляется через форму
редактирования заметки (`NoteItem`) и просмотр проекта.

**5. Как Task отображается в проекте и Планнере.**
В проекте: `ProjectViewSheet` (13168) секция «Задачи» — фильтрует
`client.notes`/`masterInfo.notes` по `projectId === project.id`, тап
переключает done. В Планнере (`SummaryScreen` 7553): все заметки/задачи в две
колонки — «Общие» (client-less) и «Рабочие» (клиентские), сорт по срочности,
done тонут вниз. Task **не** участвует в `plannedItems` (там только
сессии/консультации) и **не** генерирует напоминаний сейчас.

**6. Как сейчас формируются напоминания.**
Четыре независимые чистые функции над `clients`/`projects`, без единого движка:
- `overdueEntries()` — просроченные сессии/консультации (дата < сегодня, не
  done/cancelled);
- `healingReminders()` — done-сессии старше `HEALING_REMINDER_DAYS` (30), не
  `healed`;
- `upcomingSoonReminders()` — сессии/консультации через 36–48 ч;
- `overdueProjects()` — активные проекты с `nextActionDate <= сегодня`.
В App (2925–2929) каждая фильтруется по `dismissedReminders`, результат
раздаётся в бейдж, «Задачи», «Мастер» через `RemindersSection` (5861).
**Task источником напоминаний пока не является.**

**7. Где хранятся скрытые напоминания.**
`dismissedReminders: string[]` — стейт App, персист в `localStorage` ключ
`inka-dismissed-reminders` (2051–2058). Скрытие: `dismissReminder(key)` —
добавляет стабильный ключ в массив.

**8. Может ли закрытие старого напоминания скрыть новое действие того же
проекта. — ДА, это реальный латентный баг.**
`projectReminderKey(p)` = `` `project:${p.id}` `` (855–857) — ключ содержит
**только id проекта**, без правила и даты. Если мастер закрыла напоминание
«просрочен следующий шаг» проекта, а потом поставила проекту **новый**
`nextActionText`/`nextActionDate` — `overdueProjects()` снова вернёт этот
проект, но ключ прежний `project:<id>` уже лежит в `dismissedReminders` →
новое действие отфильтруется и **не покажется**. Остальные три типа
(`overdue:/healing:/soon:`) включают id записи, поэтому новая запись получает
новый ключ; но и у них та же запись, ставшая просроченной повторно, останется
скрытой (менее вероятный сценарий). Это ровно та проблема, против которой PR 4
вводит ключ `createReminderKey({sourceType, sourceId, rule, dueDate})`.
**В текущем PR не чиню (аудит), фиксирую как обязательное к решению в слое
напоминаний.**

**9. Есть ли `nextActionType`.**
Нет. На `Project` есть только `nextActionText: string` и
`nextActionDate: string | null` (426–427). Типа действия
(`nextActionType`) — нет. Добавление — отдельный шаг («NEXT ACTION» в плане),
с миграцией старых в `null`, без распознавания по тексту.

**10. Какие части — чистые функции, выносимы первыми.**
Блок 1.4 целиком (596–864) + `formatDate`/`dateParts`/`hexToRgba` (1.3) +
`buildChatLink`/`clientStyles`/`stylesLabel` (1.2) + `clientNameFor` (5045) +
`sessionTimelineKey` (9842). Все принимают данные аргументом, ничего не
мутируют, не трогают React/IndexedDB. Кандидаты в `domain/*Selectors.ts`,
`utils/dates.ts`, `utils/ids.ts`.

**11. Какие обращения к localStorage/IndexedDB идут прямо из UI.**
- IndexedDB — все внутри App: `initDB`, `loadClients/Projects/ContentEntries`,
  `saveClient`, `deleteClient`, `saveProject`, `deleteProject`,
  `saveContentEntry`, `deleteContentEntry`, `replaceAllData`, `importClients`
  (2212–2376). UI-компоненты сами IndexedDB не трогают — только через колбэки.
- localStorage — прямые вызовы: `readInitialTheme`/`applyTheme` (тема),
  `readInitialPrefs` + useEffect-запись `inka-prefs`, `readInitialMasterInfo` +
  запись `inka-master-info`, `readInitialDismissedReminders` + запись
  `inka-dismissed-reminders`; плюс `readSyncSettings`/`writeSyncSettings`
  (в `calendarSync.ts`) и `readContentSyncSettings`/`writeContentSyncSettings`
  (в `contentSync.ts`). Секреты синка — намеренно только в localStorage, не в
  бэкапе.

**12. Какие функции дублируются.**
- **Два `handleImportFile`**: `AdminDashboardScreen` (6173, полный бэкап
  clients+projects+contentEntries) и `DetailScreen` (8178, импорт одного
  клиента, merge). Логика похожа (чтение File → JSON → нормализация → колбэк),
  но контракт разный. Кандидат на общий хелпер `parseBackupFile()`, **не**
  на слияние в одну функцию.
- **Два экспорт-хендлера**: `handleExport` (6163, весь бэкап) и
  `handleExportClient` (8153, один клиент) — та же пара, аналогично.
- Нормализация сессии уже дедуплицирована (`normalizeSession`, 883, общая для
  клиента и проекта) — образец, как делать остальное.
Жёстких дублей бизнес-логики (двух копий одной агрегации) не обнаружено.

---

## 3. Прочие находки (фиксирую, НЕ чиню в этом PR)

1. **`projectReminderKey` нестабилен к смене действия** (см. вопрос 8) —
   основной кандидат на исправление внутри слоя напоминаний (PR 4, стабильный
   ключ с `rule` + `dueDate`).
2. **Задачи мастера (`masterInfo.notes`) живут в localStorage, а не в
   IndexedDB** — в отличие от клиентских заметок. Для слоя напоминаний оба
   источника Task нужно читать единообразно; при выносе доступа к состоянию
   это стоит учесть (не переносить хранилище, только унифицировать доступ).
3. **Задачи не попадают в бэкап через `handleExport`**, если они в
   `masterInfo` (бэкап кладёт clients/projects/contentEntries, master-info —
   отдельно). Проверить при работе с напоминаниями, но не в рамках рефакторинга.

---

## 4. Предлагаемый состав следующих PR (код не меняется до одобрения)

- **PR 2 — типы и константы.** Вынести блоки 1.2 (+ union-типы Project/статусы,
  label-массивы) и относящиеся к домену константы в `src/domain/{client,
  project,session,consultation,task}.ts`. Только перенос, без переименований,
  без смены формы данных. Проверка: `npm run build`, интерфейс не изменился.
- **PR 3 — чистые селекторы и утилиты.** Блок 1.4 → `domain/*Selectors.ts`;
  `formatDate`/`dateParts`/`hexToRgba` → `utils/dates.ts`; id-хелперы →
  `utils/ids.ts`. Сравнить списки/сортировку до-после.
- **PR 4 — reminder-движок (чистый).** `src/reminders/{types,reminderRules,
  buildReminders,reminderKeys}.ts`. Ввести `ReminderItem`, `buildReminders()`,
  стабильный `createReminderKey()`. Пока только переписать существующие 4
  правила в единый формат, поведение сохранить, но починить ключ проекта
  (вопрос 8).
- **PR 5 — состояние напоминаний.** `src/reminders/reminderState.ts` — вынести
  доступ к `dismissedReminders` из App; добавить snooze (`SnoozedReminder`).
  Хранилище пока то же (localStorage), только доступ из UI убрать.
- **PR 6 — напоминания из Task.** Первый источник — Task (правила due/overdue,
  done/snooze/без даты). Действия карточки: Выполнить/Отложить/Открыть проект.
- **PR 7 — системные правила по одному** (приближающаяся/просроченная сессия,
  заживление, проект без следующей сессии, предоплата — только если появится
  надёжный статус).
- **Позже — вынос форм и экранов** (блоки 1.8, 1.12, 1.11) по одному, через
  props. Без глобального Context, без `useTattooDiary`-обёртки-монолита.

Порядок строго инкрементальный, один независимый PR за раз, после каждого —
`npm run build` и ручная проверка (клиенты/проекты/сессии/задачи/экспорт/импорт/
contentINKA). Тестового стека в проекте нет; ставить новый попутно — только по
отдельному решению.
