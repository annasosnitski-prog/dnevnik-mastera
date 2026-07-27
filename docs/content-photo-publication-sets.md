# ContentINKA: отдельные наборы «Карусель» и «Сториз»

## Цель

Frontend должен использовать уже смерженный backend-контракт `media[].format`:

- `post` — фото для карусели;
- `story` — фото для сториз.

Пользователь должен видеть и отправлять эти наборы отдельно, при этом старые записи без `format` продолжают работать как карусель.

## Ветка

`codex/content-photo-publication-sets`, создана от актуального `main`.

## Scope

### 1. Чистая логика фото

Расширить `src/lib/contentPhotoSelection.ts`:

- добавить в `ResolvedContentPhoto` optional `publicationFormat?: 'post' | 'story'`;
- переносить значение из `ContentDraftMedia.format`;
- добавить чистый resolver, например `resolveContentPhotoPublicationSets(input)`, возвращающий:

```ts
{
  carousel: ResolvedContentPhoto[];
  stories: ResolvedContentPhoto[];
}
```

Правила:

- сначала используется текущий `resolveContentPhotoSelection`;
- `format === 'story'` → `stories`;
- `format === 'post'` → `carousel`;
- selected-фото без `format` → `carousel` как legacy fallback;
- порядок внутри каждого набора сохраняется по уже нормализованному `order_index`;
- rejected и `selected: false` не возвращаются;
- originals, `photoIds`, archive и duplicate groups не меняются.

### 2. UI карточки ContentINKA

В `ContentPhotoGallery` заменить общий блок «Подборка Инки» на два самостоятельных блока:

- `Карусель · N`;
- `Сториз · N`.

Поведение:

- показывать только непустые наборы;
- если оба пустые — сохранить текущее спокойное сообщение, что кадры не выбраны;
- карусель: первый кадр крупный, остальные сеткой, как сейчас;
- сториз: отдельная компактная вертикальная сетка; только preview-оформление, исходные фото не обрезать и не изменять;
- role badges, fullscreen viewer, download originals и «Все фотографии · N» сохранить;
- legacy entries без selection contract оставить в старом отображении.

### 3. Отдельная отправка в Instagram

Текущее меню «Поделиться» должно предлагать:

- `Карусель в Instagram · N`;
- `Сториз в Instagram · N`;
- `Другие приложения`;
- `Отмена`.

Правила:

- кнопка набора disabled, если в нём 0 фото;
- Instagram получает только фотографии выбранного набора и в его текущем порядке;
- payload остаётся строго `{ files }` без `text`, `title`, `url`;
- сохранённый `ContentEntry.textDraft` копируется отдельно через существующий clipboard flow;
- all-or-nothing подготовка файлов сохраняется;
- `AbortError` остаётся обычной отменой;
- «Другие приложения» сохраняет прежнее поведение: все оригинальные фотографии записи + сохранённый текст;
- старые записи без `format` целиком отправляются как карусель;
- никаких новых IndexedDB-полей и копий изображений.

### 4. Тесты

Добавить/обновить unit tests:

- `post` и `story` разделяются корректно;
- mixed selection сохраняет относительный порядок внутри каждого набора;
- selected без `format` попадает в carousel;
- rejected и selected false исключаются;
- legacy entry без selection contract остаётся carousel;
- Instagram preparation получает только массив выбранного набора;
- нулевой набор не отправляется;
- существующие проверки MIME, WebP, payload без text/title/url, all-or-nothing, clipboard source и AbortError остаются зелёными.

## Не менять

- backend/API;
- генерацию текста, архетипы и редактор;
- переводы, approval/exemplar;
- photo selection contract;
- IndexedDB schema;
- export/import;
- production deploy.

## Проверки перед Draft PR

```bash
npm test
npm run typecheck
npm run build
```

Открыть Draft PR в `main`. Не merge.