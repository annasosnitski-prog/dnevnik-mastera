import type { ContentEntryLink } from '../lib/contentLink';
import type { ContentDraftMedia, ContentSessionContext } from '../lib/contentSync';
import type { ContentTranslations } from '../lib/contentTranslation';

// Единая сущность для всё, что проходит через ContentINKA — сессия,
// консультация или свободная заметка («мастерская», если clientId=null),
// с фото или без. Живёт в своём IndexedDB store ('contentEntries'), не
// внутри Client — поэтому ContentINKA остаётся единственным рабочим экраном,
// а вкладка клиента и просмотр сессии/консультации только находят эти же
// записи по источнику и передают управление туда.
export interface ContentEntry {
  id: string;
  createdDate: string;
  clientId: string | null; // null = мастерская
  sourceType: 'session' | 'consultation' | 'freeform';
  sourceId: string | null; // id сессии/консультации, если создано оттуда
  format: 'post' | 'story' | null; // прицельный формат («текст для сторис»), если запрашивался
  text: string; // ввод мастера — тема/инструкция, не результат
  context: ContentSessionContext; // снимок на момент генерации — перегенерация не бегает за живой сессией
  textArchetype?: string | null; // выбранный основной голос; null = Инка выбирает сама
  photos: string[]; // оригиналы (не превью) — те же data URL, что и в Session.photos
  photoIds?: string[]; // стабильные ID в том же порядке, что и photos
  contentDraft: ContentDraftMedia[] | null; // per-photo разметка (role/format/...), если есть фото
  visualArchetype: string | null;
  textTriad: { opens: string; leads: string; closes: string } | null;
  textDraft: string; // черновик текста — то, ради чего всё
  status: 'draft' | 'confirmed';
  isExemplar: boolean;
  translations?: ContentTranslations;
  // Ручная привязка к проекту/сессии для будущего отображения контента
  // внутри проекта — необязательна, независима от sourceType/sourceId (см.
  // src/lib/contentLink.ts). null = осознанно оставлено без привязки;
  // undefined (старые записи) нормализуется в null тем же модулем.
  link?: ContentEntryLink | null;
  // «Удалить» на уже привязанной (к проекту/сессии) записи не стирает её —
  // запись остаётся в базе и продолжает показываться там, где привязана,
  // только прячется из собственного списка черновиков ПОСТиНКИ (см.
  // deleteContentEntry в ContentINKAScreen). Для непривязанных записей
  // «Удалить» по-прежнему стирает их насовсем — прятать нечего, черновик
  // больше нигде не появится.
  removedFromWorkspace?: boolean;
}
