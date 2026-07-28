# Технический аудит перед рефакторингом (обновление)

> Предыдущая версия этого документа была отправлена в PR #123
> («docs: технический аудит перед рефакторингом (PR 1)») и **закрыта без
> мержа** 2026-07-27 — план так и не стартовал. За это время
> `TattoDiary.tsx` вырос ещё примерно на 1100 строк (PR #144–#150), поэтому
> все номера строк из PR #123 устарели. Этот документ — их пересчёт плюс
> уточнённый план разбивки. Рабочий код этим PR не меняется.

## 1. Текущее состояние

- `src/components/TattoDiary.tsx` — **15 123 строки**, один файл.
- Корневой компонент `TattoDiary()` — строки **1577–3793 (2217 строк)** —
  держит почти всё состояние приложения (clients/projects/content, тема,
  preferences, masterInfo, роутинг экранов, инициализация IndexedDB,
  все обработчики верхнего уровня: `handleAddProject`, `handleAddSession`,
  `deleteProject` и т.д.).
- Уже частично выносится наружу по мере фич (не по плану, попутно):
  `src/domain/projectSelectors.ts`, `src/domain/contentProject.ts`,
  `src/lib/contentLink.ts`, `src/lib/contentSync.ts`, `src/lib/sessionSave.ts`,
  `src/components/project/*`, `src/components/content/*`,
  `src/reminders/*`.

## 2. Карта блоков `TattoDiary.tsx`

Строки актуальны на коммит `d53b4f5` (текущий `main`/эта ветка).
Формат: `начало–конец (размер) имя — риск переноса`.

### Низкий риск — чистые функции и презентационные листья

| Строки | Размер | Имя | Категория |
|---|---|---|---|
| 322–380 | 59 | `buildChatLink` | helper |
| 414–423 | 10 | `hexToRgba` | helper |
| 424–427 | — | `isRTL`/`firstLetter`/`nameRest` | helper (уже `export`) |
| 452–482 | 39 | `healingReminderMessage`/`localizedWhen`/`soonReminderMessage` | helper |
| 483–611 | 129 | `normalizeSession`/`normalizeClientNote`/`normalizeClient`/`normalizeProject` | helper |
| 632–676 | 45 | `StarDivider`, `StarIcon` | UI-атом |
| 3794–4149 | ~355 | `RPSHandIcon`, `RPSTauntFace`, `RPSGame`, `CupIcon`, `BallIcon`, `CupsGame`, `PlayingCard` | мини-игры |
| 4150–4302 | 153 | `rankValue`, `drawCard`, `handValue`, `BlackjackGame` | мини-игры |
| 4303–4446 | 144 | `TrialGate` | самодостаточный экран |
| 4447–4623 | 177 | `TopStripe`/`RightStripe`/`GemCorner`/`GoldFrame`/… (уже `export`) | UI-атом |
| 5178–5247 | 70 | `StatBlock`, `SplitStatBlock` | UI-атом |
| 6638–6696 | 59 | `InstagramIcon`…`WhatsAppIcon` | иконки |
| 7371–7403 | 33 | `tagLabel`, `stripTagPrefix`, `formatBookingTime` | helper |
| 8995–9036 | 44 | `MetaLabel`, `MetaValue`, `SectionDivider`, `SectionHeader` | UI-атом |
| 12550–12634 | 85 | `BottomSheet`, `SheetCloseButton`, `SheetEditButton`, `SheetSavedCheck` | UI-атом |
| 12884–12912 | 29 | `collectCalendarEvents`, `botSlotDayKey` | helper |
| 14719–14732 | 14 | `projectContentLinkLabel` | helper |

### Средний риск — автономные bottom sheets / формы (есть props, не читают состояние корня напрямую)

| Строки | Размер | Имя |
|---|---|---|
| 13226–13369 | 144 | `NewClientSheet` |
| 13370–13469 | 100 | `EditClientSheet` |
| 13470–13759 | 290 | `NewSessionSheet` |
| 13760–13929 | 170 | `AddChoiceSheet`, `WorkshopCreateChoiceSheet` |
| 13930–14249 | 320 | `ProjectSessionPickerSheet`, `ClientKindChoiceSheet`, `ClientPickerSheet`, `QuickClientSheet` |
| 14250–14502 | 253 | `NewConsultationSheet` |
| 14503–14718 | 216 | `ProjectViewSheet` |
| 14733–15123 | 391 | `ProjectContentCard`, `NewProjectSheet` |
| 12913–13225 | 313 | `CalendarSheet` |
| 12688–12883 | 196 | `ContentLinkPickerSheet` |
| 11066–11209 | 144 | `ContentShareSheet`, `ContentPhotoGallery` |
| 12440–12549 | 110 | `TimelineViewSheet` |

### Высокий риск — экраны (сотни строк, собственный `useState`, тесная связь с корнем)

| Строки | Размер | Имя |
|---|---|---|
| 4998–5177 | 180 | `WorkshopScreen` (уже частично выделен в PR #144) |
| 6214–6637 | 424 | `AdminDashboardScreen` |
| 6697–7370 | 674 | `MasterDashboardScreen` |
| 7508–7708 | 201 | `SettingsScreen` |
| 7709–8080 | 372 | `SummaryScreen` |
| 8225–8631 | 407 | `DetailScreen` |
| 11210–12399 | **1190** | `ContentINKAScreen` (самый большой блок в файле) |

### Инфраструктура (эффекты/фон, риск низкий, но с оговоркой про module-level кэши)

| Строки | Размер | Имя |
|---|---|---|
| 677–1373 | ~700 | `CelebrationBurst`, `runMilestoneShow`, `buildStars/getStars`, `buildMeteors/getMeteors`, `buildCloudLayers/getCloudLayers`, `buildCraft/getCraft`, `FunWinSalute` |
| 1118–1145 | 28 | `useIsLightTheme` |
| 1443–1576 | 134 | `readInitialTheme`/`applyTheme`/`readInitialPrefs`/`readInitialMasterInfo` |

`getStars()`, `getCloudLayers()`, `getCraft()` — модуль-level memoized кэши
(ленивая инициализация вне React). При переносе в отдельный модуль важно не
задвоить кэш через дублирующийся импорт/бандлинг.

## 3. Ключевая находка из PR #123 — уже исправлена в коде

Старый аудит указывал: `projectReminderKey(p)` = `` `project:${p.id}` `` —
ключ без правила/даты, из-за чего закрытие одного напоминания «просрочен
следующий шаг» навсегда скрывало и будущие действия того же проекта.

Проверено: это уже исправлено в `src/reminders/reminderKeys.ts:79` —
`projectReminderKey` теперь строится через `actionSignature({projectId, rule,
nextActionDate, nextActionText})`, комментарий в коде прямо ссылается на
`docs/TECH_REFACTOR_AUDIT.md, вопрос 8`. То есть находка была применена
напрямую в код, хотя сам документ так и не был смержен. **Действий не
требуется**, оставлено здесь для истории.

## 4. Известный архитектурный риск на будущее (не в этом PR)

`Session` хранится в двух разных местах в зависимости от владельца записи
контента (см. PR #150): `client.sessions` (когда есть `clientId`) или
`Project.sessions` (когда клиента нет — «Мастерская»). Это осознанное
решение, задокументированное и покрытое тестами (`sessionSave.ts`), но при
любом будущем рефакторинге данных о сессиях это первое место, которое
сломает наивное предположение «сессии живут в одном месте».

## 5. План точечного рефакторинга (PR 2–8)

Каждый PR: без изменения поведения, `npm test` + `npm run typecheck` +
`npm run build` зелёные до и после, дифф — только перенос/экспорт, без
попутных правок логики.

1. **PR 2 — иконки и мини-игры** (риск: нулевой). `src/components/icons/`,
   `src/components/games/`. Строки 3794–4302, 6638–6696, 632–676.
2. **PR 3 — чистые хелперы** (риск: нулевой). `src/lib/`. Строки
   322–611, 7371–7403, 12884–12912, 14719–14732.
3. **PR 4 — UI-примитивы** (риск: низкий). `src/components/ui/`. Строки
   4447–4623, 5178–5247, 8995–9036, 12550–12634. Обновить импорты в уже
   существующих `src/components/project/*`, которые сейчас тянут эти
   примитивы прямо из `TattoDiary.tsx`.
4. **PR 5 — bottom sheets, часть 1** (риск: средний). `NewClientSheet`,
   `EditClientSheet`, `ClientPickerSheet`, `QuickClientSheet`,
   `ClientKindChoiceSheet` → `src/components/sheets/`.
5. **PR 6 — bottom sheets, часть 2**. `NewSessionSheet`,
   `NewConsultationSheet`, `NewProjectSheet`, `ProjectViewSheet`,
   `ProjectSessionPickerSheet` → `src/components/sheets/`.
6. **PR 7 — bottom sheets, часть 3 + эффекты**. `CalendarSheet`,
   `ContentLinkPickerSheet`, `ContentShareSheet`, `TimelineViewSheet` →
   `src/components/sheets/`; `CelebrationBurst`/звёзды/облака/корабль →
   `src/effects/`.
7. **PR 8+ — экраны, по одному за PR** (риск: высокий). Порядок по
   возрастанию размера: `WorkshopScreen` → `SettingsScreen` →
   `DetailScreen` → `SummaryScreen` → `AdminDashboardScreen` →
   `MasterDashboardScreen` → `ContentINKAScreen` (самый большой и самый
   последний). Каждому экрану — явный интерфейс пропсов перед переносом.
8. **Последним — сам `TattoDiary()`** (1577–3793). Не разбивать JSX одним
   PR. Сначала сгруппировать `useState`/`useReducer` по доменам
   (clients/projects/content/theme-prefs/навигация) в кастомные хуки
   (`useClientsState`, `useProjectsState`, …), которые компонент
   композирует, — без переноса самого рендера. Разбор рендера на роутер —
   отдельная, более поздняя инициатива вне рамок этого плана.

## Test plan

- [x] `npm run build` — только новый файл документации, код не тронут.
- [ ] Ревью плана перед стартом PR 2.
