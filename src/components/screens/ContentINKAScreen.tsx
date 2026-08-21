import { memo, useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { InkaLogo } from '../InkaLogo';
import { StarDivider } from '../icons/StarIcons';
import { GoldFrame } from '../ui/Stripes';
import { TodayDateBadge } from '../ui/TodayDateBadge';
import { SessionPhotos } from '../client/ClientControls';
import { ArchetypeToolbar } from '../content/ArchetypeToolbar';
import { ActionButton, ContentEntryActions } from '../content/ContentEntryActions';
import { ContentShareSheet, ContentLinkStatus, ContentLinkPickerSheet } from '../sheets/ContentAndCalendarSheets';
import { COLORS, fs, INPUT_STYLE, SUBMIT_STYLE } from '../TattoDiary';
import { type Client } from '../../domain/client';
import { type Project } from '../../domain/project';
import { type ContentEntry } from '../../domain/content';
import { type Session } from '../../domain/session';
import { type Consultation } from '../../domain/consultation';
import { formatDate } from '../../utils/dates';
import { copyTextToClipboard, createCopyFeedbackController, type CopyFeedback } from '../../lib/clipboard';
import {
  createContentIngestJob,
  translateContentText,
  ContentSyncError,
  type ContentIngestParams,
  type ContentTranslationLanguage,
} from '../../lib/contentSync';
import {
  type ContentCreateJobRecord,
  type ContentIngestJobRecord,
  type ContentRefreshJobRecord,
} from '../../lib/contentJobQueue';
import {
  contentSelectionRoleLabel,
  createContentPhotoIds,
  hasContentPhotoSelectionContract,
  resolveAllContentPhotos,
  resolveContentPhotoPublicationSets,
  type ResolvedContentPhoto,
} from '../../lib/contentPhotoSelection';
import {
  canShareInstagramContent,
  isShareAbortError,
  prepareInstagramContentShare,
  prepareStandardContentShare,
  contentPhotoExtension,
  type ContentSharePhoto,
} from '../../lib/contentShare';
import { downsizePhotosSequentially, downsizeForContentDuplicate } from '../../lib/imagePreview';
import { createContentEntryCardRevision } from '../../lib/contentCardMemo';
import { buildInitialContentInstruction } from '../../lib/contentPrompt';
import { confirmContentEntry, createContentEntryId, setContentEntryExemplar } from '../../lib/contentApproval';
import {
  contentTranslationKey,
  createContentTranslationRunner,
  currentContentTranslation,
  isContentTranslationStale,
} from '../../lib/contentTranslation';
import {
  MAX_CONTENT_TEXT_CHARACTERS,
  contentTextLength,
  isContentTextDirty,
  saveContentTextEdit,
} from '../../lib/contentTextEditing';
import {
  contentComposerItemKey,
  selectContentWorkspaceEntries,
  resolveContentFocusEntry,
  type ContentSourceRef,
  type ContentWorkspaceNavigation,
} from '../../lib/contentWorkspace';
import {
  isContentEntryLinked,
  resolveContentEntryLink,
  setContentEntryLink,
  type ContentEntryLink,
} from '../../lib/contentLink';

// Вынесено из TattoDiary.tsx без изменения поведения, разметки и
// prop-driven контракта. Полноценный рабочий интерфейс ContentINKA —
// самый большой экран приложения, последний из вынесенных по плану
// docs/TECH_REFACTOR_AUDIT.md.

// Standard «Другие приложения» flow: keep sharing photos and text together,
// with the same text-only and clipboard fallbacks used by the old button.
async function shareContentEntry(entryId: string, photos: string[], text: string): Promise<void> {
  const preparation = prepareStandardContentShare({
    entryId,
    savedText: text,
    photos: photos.map((src, originalIndex) => ({ src, originalIndex })),
  });
  const { files, payload } = preparation;
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (files.length > 0 && nav.canShare && nav.canShare({ files })) {
    try {
      await nav.share(payload);
      return;
    } catch (err) {
      if (isShareAbortError(err)) return;
    }
  }
  // Нет фото или платформа не поддерживает шеринг файлов — делимся хотя бы
  // текстом (или копируем в буфер, если и это недоступно).
  if (nav.share) {
    try {
      await nav.share({ text });
      return;
    } catch (err) {
      if (isShareAbortError(err)) return;
    }
  }
  await copyTextToClipboard(text).catch(() => false);
}

function downloadContentPhoto(entryId: string, photo: ResolvedContentPhoto): void {
  const link = document.createElement('a');
  link.href = photo.src;
  link.download = `contentinka-${entryId}-${photo.originalIndex}.${contentPhotoExtension(photo.src)}`;
  link.click();
}

// Архетипные chips — под капотом тот же master_instruction в
// POST /api/ingest-jobs (см. sendToContent в contentSync.ts). Названы напрямую по семи архетипам
// contentINKA (см. lib/prompts/archetypes.txt в contentinka), а не по
// настроению («теплее»/«жёстче») — так кнопка сразу говорит, какой голос
// перегенерирует текст. Каждый пресет ставит выбранный архетип в роль
// opens — ищет в уже написанном черновике фразы/образы, которые стоит
// сохранить, вместо переписывания с нуля (см. regenerate ниже, шлёт
// entry.textDraft как previous_draft, backend сам решает, что удержать).
// Названия и инструкции сохранены без изменений; отдельный refresh вынесен
// из этого набора ниже в действие «Обновить черновик».
const ARCHETYPE_CHIPS: { label: string; instruction: string }[] = [
  { label: 'Трикстер', instruction: 'открой материал в архетипе Трикстер — резче, прямее, с лёгкой дерзостью, без пафоса' },
  { label: 'Женщина/Тепло', instruction: 'открой материал в архетипе Женщина/Тепло — теплее, мягче, телесно' },
  { label: 'Исследователь', instruction: 'открой материал в архетипе Исследователь — через любопытство и процесс поиска' },
  { label: 'Мудрец', instruction: 'открой материал в архетипе Мудрец — точнее, через понимание сути, без лекции' },
  { label: 'Дурак', instruction: 'открой материал в архетипе Дурак — проще, легче, с сухим юмором' },
  { label: 'Lover', instruction: 'открой материал в архетипе Lover — через чувственность и телесность, без цены' },
  { label: 'Творец', instruction: 'открой материал в архетипе Творец — через форму, материал и рождение образа' },
];

const CONTENT_TRANSLATION_OPTIONS: {
  language: ContentTranslationLanguage;
  actionLabel: string;
  title: string;
  dir: 'rtl' | 'ltr';
}[] = [
  { language: 'he', actionLabel: 'На иврит', title: 'Иврит', dir: 'rtl' },
  { language: 'en', actionLabel: 'На английский', title: 'Английский', dir: 'ltr' },
];

type ContentTranslationFeedback = {
  state: 'loading' | 'success' | 'error';
  message: string;
  sourceText: string;
};

type ContentTextEditorState = {
  baseText: string;
  editedText: string;
};

type ContentTextEditFeedback = {
  kind: 'success' | 'error';
  message: string;
};

type ContentShareFeedback = {
  kind: 'success' | 'error';
  message: string;
};

const CONTENT_ENTRY_PAGE_SIZE = 8;

function ContentPhotoGallery({ entry }: { entry: ContentEntry }) {
  const [viewerPhoto, setViewerPhoto] = useState<ResolvedContentPhoto | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const input = { photos: entry.photos, photoIds: entry.photoIds, contentDraft: entry.contentDraft };
  const hasSelectionContract = hasContentPhotoSelectionContract(entry.contentDraft);
  const publicationSets = resolveContentPhotoPublicationSets(input);
  const selectedPhotos = [...publicationSets.carousel, ...publicationSets.stories];
  const allPhotos = resolveAllContentPhotos(input);

  const roleBadge = (photo: ResolvedContentPhoto) =>
    photo.selectionRole ? (
      <span className={`content-photo-role${photo.selectionRole === 'cover' ? ' is-cover' : ''}`}>
        {contentSelectionRoleLabel(photo.selectionRole)}
      </span>
    ) : null;

  const photoButton = (photo: ResolvedContentPhoto, className: string) => (
    <button
      key={photo.id}
      type="button"
      className={className}
      onClick={() => setViewerPhoto(photo)}
      aria-label={`Открыть фотографию ${photo.originalIndex + 1}`}
    >
      <img src={photo.src} alt="" loading="lazy" decoding="async" />
      {roleBadge(photo)}
      {hasSelectionContract && !photo.selected && <span className="content-photo-not-selected">Не выбрано</span>}
    </button>
  );

  return (
    <>
      {hasSelectionContract ? (
        <div className="content-photo-output">
          <div className="content-photo-output__title">Подборка Инки</div>
          {selectedPhotos.length === 0 ? (
            <div className="content-photo-output__empty">Инка не выбрала кадры для публикации</div>
          ) : (
            <div className="content-photo-publication-sets">
              {publicationSets.carousel.length > 0 && (
                <section className="content-photo-publication-set" aria-label="Карусель">
                  <div className="content-photo-publication-set__title">Карусель · {publicationSets.carousel.length}</div>
                  <div className="content-photo-selection">
                    {photoButton(publicationSets.carousel[0], 'content-photo-hero')}
                    {publicationSets.carousel.length > 1 && (
                      <div className="content-photo-grid">
                        {publicationSets.carousel.slice(1).map((photo) => photoButton(photo, 'content-photo-tile'))}
                      </div>
                    )}
                  </div>
                </section>
              )}
              {publicationSets.stories.length > 0 && (
                <section className="content-photo-publication-set" aria-label="Сториз">
                  <div className="content-photo-publication-set__title">Сториз · {publicationSets.stories.length}</div>
                  <div className="content-photo-selection">
                    {photoButton(publicationSets.stories[0], 'content-photo-hero')}
                    {publicationSets.stories.length > 1 && (
                      <div className="content-photo-grid">
                        {publicationSets.stories.slice(1).map((photo) => photoButton(photo, 'content-photo-tile'))}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
          <div className="content-photo-archive">
            <button
              type="button"
              className="content-photo-archive__toggle"
              aria-expanded={archiveOpen}
              onClick={() => setArchiveOpen((open) => !open)}
            >
              Все фотографии · {allPhotos.length}
            </button>
            {archiveOpen && allPhotos.length > 0 && (
              <div className="content-photo-archive__grid">
                {allPhotos.map((photo) => photoButton(photo, 'content-photo-tile'))}
              </div>
            )}
          </div>
        </div>
      ) : entry.photos.length > 0 ? (
        <div className="content-photo-legacy">
          {allPhotos.map((photo) => photoButton(photo, 'content-photo-legacy__tile'))}
        </div>
      ) : null}

      {viewerPhoto &&
        createPortal(
          <div className="content-photo-viewer" role="dialog" aria-modal="true" aria-label="Просмотр фотографии" onClick={() => setViewerPhoto(null)}>
            <button type="button" className="content-photo-viewer__close" aria-label="Закрыть" onClick={() => setViewerPhoto(null)}>
              ×
            </button>
            <div className="content-photo-viewer__content" onClick={(event) => event.stopPropagation()}>
              <img src={viewerPhoto.src} alt="" />
              <button type="button" className="content-photo-viewer__download" onClick={() => downloadContentPhoto(entry.id, viewerPhoto)}>
                Сохранить фото
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

type ContentEntryCardProps = {
  entry: ContentEntry;
  highlighted: boolean;
  clients: Client[];
  projects: Project[];
  revision: string;
  children: ReactNode;
};

const ContentEntryCard = memo(function ContentEntryCard({ entry, highlighted, children }: ContentEntryCardProps) {
  return (
    <div
      id={`content-entry-${entry.id}`}
      style={
        highlighted
          ? { boxShadow: '0 0 0 2px var(--gold)', borderRadius: 3, transition: 'box-shadow 0.3s ease' }
          : undefined
      }
    >
      <GoldFrame plain style={{ padding: '14px 16px' }}>
        {children}
      </GoldFrame>
    </div>
  );
}, (previous, next) =>
  previous.entry === next.entry &&
  previous.highlighted === next.highlighted &&
  previous.clients === next.clients &&
  previous.projects === next.projects &&
  previous.revision === next.revision,
);

// Полноценный рабочий интерфейс ContentINKA — отдельная страница
// (NavFab → «Контент»). Здесь собирается материал с нуля или из выбранной
// сессии/консультации и применяются все действия к черновику. Остальные
// поверхности показывают только компактный статус и переходят сюда; данные
// по-прежнему читаются и пишутся через единственный contentEntries store.
export function ContentINKAScreen({
  clients,
  projects,
  contentEntries,
  contentIngestJobs,
  navigation,
  onNavigationApplied,
  focusEntryId,
  onFocusEntryApplied,
  onSaveEntry,
  onDeleteEntry,
  onSaveContentIngestJob,
  onDeleteContentIngestJob,
  onCreateProjectForLink,
  onCreateSessionForLink,
  onBack,
  onOpenCalendar,
}: {
  clients: Client[];
  projects: Project[];
  contentEntries: ContentEntry[];
  contentIngestJobs: ContentIngestJobRecord[];
  navigation: ContentWorkspaceNavigation | null;
  onNavigationApplied: () => void;
  // Узкий target «раскрыть вот эту запись» по id (см. contentFocusEntryId в
  // родителе) — независим от navigation/ContentWorkspaceNavigation, которая
  // не подходит для freeform/безклиентских записей.
  focusEntryId: string | null;
  onFocusEntryApplied: () => void;
  onSaveEntry: (entry: ContentEntry) => void;
  onDeleteEntry: (id: string) => void;
  onSaveContentIngestJob: (record: ContentIngestJobRecord) => Promise<void>;
  onDeleteContentIngestJob: (id: string) => Promise<void>;
  // Узкие callbacks запуска УЖЕ существующих сценариев создания Project/
  // Session из ContentLinkPickerSheet (кнопка «Создать проект»/«Создать
  // сессию») — сам sheet не хранит вторую копию этих форм и не знает, как
  // именно родитель их открывает (см. TattoDiary root: NewProjectSheet/
  // ProjectSessionPickerSheet+NewSessionSheet).
  onCreateProjectForLink: (entryId: string, preferredClientId: string | null) => void;
  onCreateSessionForLink: (entryId: string, preferredClientId: string | null) => void;
  onBack: () => void;
  onOpenCalendar: () => void;
}) {
  const [composerClientId, setComposerClientId] = useState<string | null>(null); // null = мастерская
  const [composerItemKey, setComposerItemKey] = useState<string>(''); // '' | 's:<id>' | 'c:<id>'
  const [composerText, setComposerText] = useState('');
  const [composerTextArchetype, setComposerTextArchetype] = useState('');
  const [composerPhotos, setComposerPhotos] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingJobIds, setRetryingJobIds] = useState<Set<string>>(() => new Set());
  const refreshingEntryIds = new Set(
    contentIngestJobs
      .filter((job): job is ContentRefreshJobRecord => job.operation === 'refresh' && job.state !== 'failed')
      .map((job) => job.entryId),
  );
  const refreshJobByEntry = new Map(
    contentIngestJobs
      .filter((job): job is ContentRefreshJobRecord => job.operation === 'refresh')
      .map((job) => [job.entryId, job]),
  );
  const createIngestJobs = contentIngestJobs.filter((job): job is ContentCreateJobRecord => job.operation === 'create');
  const isEntryRefreshing = (entryId: string) => refreshingEntryIds.has(entryId);
  const [selectedArchetypeByEntry, setSelectedArchetypeByEntry] = useState<Record<string, string>>({});
  const [refreshFeedbackByEntry, setRefreshFeedbackByEntry] = useState<Record<string, {
    kind: 'success' | 'error';
    message: string;
  }>>({});
  const [copyFeedbackByEntry, setCopyFeedbackByEntry] = useState<Record<string, CopyFeedback>>({});
  // id записи, для которой сейчас открыт sheet «Сохранить в…» — и после
  // одобрения непривязанной записи (обязательный вопрос), и по ручному
  // «Привязать»/«Изменить привязку» из карточки (тот же sheet). Вкладка
  // (Проект/Сессия) — отдельный managed state, а не внутренний step sheet'а,
  // чтобы одинаково задавать её и при открытии, и при возврате после отмены
  // создания Project/Session.
  const [linkPickerEntryId, setLinkPickerEntryId] = useState<string | null>(null);
  const [linkPickerTarget, setLinkPickerTarget] = useState<'project' | 'session'>('project');
  // Учитывает не только явный entry.link, но и фактически resolved связь
  // (resolveContentEntryLink) — так legacy/source-session записи (link ещё
  // не задан явно, но sourceType==='session' резолвится в сессию) тоже
  // открываются сразу на вкладке «Сессия», а не «Проект» по умолчанию.
  const openLinkPicker = (entryId: string) => {
    const candidate = contentEntriesRef.current.find((entry) => entry.id === entryId);
    const resolved = candidate ? resolveContentEntryLink(candidate, projects, clients) : null;
    setLinkPickerTarget(resolved?.kind === 'session' ? 'session' : 'project');
    setLinkPickerEntryId(entryId);
  };
  const copyFeedbackController = useMemo(
    () => createCopyFeedbackController({ onChange: setCopyFeedbackByEntry }),
    [],
  );
  const translationRunner = useMemo(() => createContentTranslationRunner(), []);
  const [translationMenuEntryIds, setTranslationMenuEntryIds] = useState<Set<string>>(() => new Set());
  const [translationFeedbackByKey, setTranslationFeedbackByKey] = useState<Record<string, ContentTranslationFeedback>>({});
  const [translationCopyFeedbackByKey, setTranslationCopyFeedbackByKey] = useState<Record<string, CopyFeedback>>({});
  const [textEditorsByEntry, setTextEditorsByEntry] = useState<Record<string, ContentTextEditorState>>({});
  const [textEditFeedbackByEntry, setTextEditFeedbackByEntry] = useState<Record<string, ContentTextEditFeedback>>({});
  const [shareMenuEntryId, setShareMenuEntryId] = useState<string | null>(null);
  const [shareFeedbackByEntry, setShareFeedbackByEntry] = useState<Record<string, ContentShareFeedback>>({});
  const textEditFeedbackTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const translationCopyFeedbackController = useMemo(
    () => createCopyFeedbackController({ onChange: setTranslationCopyFeedbackByKey }),
    [],
  );
  const contentEntriesRef = useRef(contentEntries);
  contentEntriesRef.current = contentEntries;
  const saveEntryInWorkspace = (entry: ContentEntry) => {
    contentEntriesRef.current = [entry, ...contentEntriesRef.current.filter((candidate) => candidate.id !== entry.id)];
    onSaveEntry(entry);
  };
  const hasUnsavedTextEdit = (entry: ContentEntry): boolean => {
    const editor = textEditorsByEntry[entry.id];
    return entry.status === 'draft' && !!editor && isContentTextDirty(entry.textDraft, editor.editedText);
  };
  const showTextEditFeedback = (entryId: string, feedback: ContentTextEditFeedback) => {
    const currentTimer = textEditFeedbackTimers.current.get(entryId);
    if (currentTimer) clearTimeout(currentTimer);
    setTextEditFeedbackByEntry((current) => ({ ...current, [entryId]: feedback }));
    const timer = setTimeout(() => {
      textEditFeedbackTimers.current.delete(entryId);
      setTextEditFeedbackByEntry((current) => {
        const next = { ...current };
        delete next[entryId];
        return next;
      });
    }, 2200);
    textEditFeedbackTimers.current.set(entryId, timer);
  };
  const startTextEdit = (entry: ContentEntry) => {
    if (entry.status !== 'draft' || isEntryRefreshing(entry.id)) return;
    const currentTimer = textEditFeedbackTimers.current.get(entry.id);
    if (currentTimer) clearTimeout(currentTimer);
    textEditFeedbackTimers.current.delete(entry.id);
    setTextEditorsByEntry((current) => ({
      ...current,
      [entry.id]: { baseText: entry.textDraft, editedText: entry.textDraft },
    }));
    setTextEditFeedbackByEntry((current) => {
      const next = { ...current };
      delete next[entry.id];
      return next;
    });
  };
  const cancelTextEdit = (entryId: string) => {
    const currentTimer = textEditFeedbackTimers.current.get(entryId);
    if (currentTimer) clearTimeout(currentTimer);
    textEditFeedbackTimers.current.delete(entryId);
    setTextEditorsByEntry((current) => {
      const next = { ...current };
      delete next[entryId];
      return next;
    });
    setTextEditFeedbackByEntry((current) => {
      const next = { ...current };
      delete next[entryId];
      return next;
    });
  };
  const saveTextEdit = (entry: ContentEntry) => {
    const editor = textEditorsByEntry[entry.id];
    if (!editor) return;
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    const outcome = saveContentTextEdit(currentEntry, {
      baseText: editor.baseText,
      editedText: editor.editedText,
    });

    if (outcome.status === 'saved') saveEntryInWorkspace(outcome.entry);
    if (outcome.status === 'saved' || outcome.status === 'unchanged') {
      cancelTextEdit(entry.id);
      showTextEditFeedback(entry.id, { kind: 'success', message: 'Сохранено' });
      return;
    }
    if (outcome.status === 'empty') {
      showTextEditFeedback(entry.id, { kind: 'error', message: 'Текст не может быть пустым' });
      return;
    }
    if (outcome.status === 'too_long') {
      showTextEditFeedback(entry.id, { kind: 'error', message: 'Сократите текст вручную до 650 символов' });
      return;
    }

    cancelTextEdit(entry.id);
    showTextEditFeedback(entry.id, {
      kind: 'error',
      message: outcome.status === 'conflict'
        ? 'Текст уже изменился. Откройте редактор заново.'
        : 'Одобренный текст нельзя редактировать',
    });
  };
  const approveEntry = (entry: ContentEntry) => {
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    if (currentEntry.status === 'confirmed' || hasUnsavedTextEdit(currentEntry) || isEntryRefreshing(currentEntry.id)) return;
    saveEntryInWorkspace(confirmContentEntry(currentEntry));
    // Только после сохранения status: confirmed — и только если запись ещё
    // не связана (включая уже связанные через sourceType==='session') —
    // открываем обязательный вопрос «Куда сохранить контент?». confirmContentEntry
    // чистая и идемпотентная — повторный вызов не создаёт новое состояние.
    if (!isContentEntryLinked(confirmContentEntry(currentEntry))) openLinkPicker(currentEntry.id);
  };
  const updateEntryLink = (entry: ContentEntry, link: ContentEntryLink | null) => {
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    saveEntryInWorkspace(setContentEntryLink(currentEntry, link));
  };
  const updateExemplar = (entry: ContentEntry, isExemplar: boolean) => {
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    if (currentEntry.status !== 'confirmed') return;
    saveEntryInWorkspace(setContentEntryExemplar(currentEntry, isExemplar));
  };
  const contentTranslationsMountedRef = useRef(false);
  const knownContentEntryIds = useRef(new Set(contentEntries.map((entry) => entry.id)));
  const [filterClientId, setFilterClientId] = useState<string>('all'); // 'all' | 'studio' | clientId
  const [focusedSource, setFocusedSource] = useState<ContentSourceRef | null>(null);
  const [visibleEntryLimit, setVisibleEntryLimit] = useState(CONTENT_ENTRY_PAGE_SIZE);
  // Кратковременная подсветка записи, раскрытой через focusEntryId (клик по
  // карточке в разделе «Контент» экрана проекта) — гаснет сама, ничего не
  // меняет в данных.
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);
  // Какую скрытую (removedFromWorkspace) запись раскрыли через focusEntryId —
  // в отличие от самого focusEntryId (одноразовая команда, которую родитель
  // тут же обнуляет через onFocusEntryApplied в том же батче обновлений),
  // это держится, пока не размонтируется экран, иначе запись пропадала бы
  // из workspaceEntries ниже сразу после того, как эффект её раскрыл.
  const [revealedEntryId, setRevealedEntryId] = useState<string | null>(null);
  const entriesListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentEntryIds = new Set(contentEntries.map((entry) => entry.id));
    for (const entryId of knownContentEntryIds.current) {
      if (!currentEntryIds.has(entryId)) {
        copyFeedbackController.clear(entryId);
        const textEditTimer = textEditFeedbackTimers.current.get(entryId);
        if (textEditTimer) clearTimeout(textEditTimer);
        textEditFeedbackTimers.current.delete(entryId);
        setTextEditorsByEntry((current) => {
          const next = { ...current };
          delete next[entryId];
          return next;
        });
        setTextEditFeedbackByEntry((current) => {
          const next = { ...current };
          delete next[entryId];
          return next;
        });
        if (shareMenuEntryId === entryId) setShareMenuEntryId(null);
        setShareFeedbackByEntry((current) => {
          const next = { ...current };
          delete next[entryId];
          return next;
        });
        for (const option of CONTENT_TRANSLATION_OPTIONS) {
          translationCopyFeedbackController.clear(contentTranslationKey(entryId, option.language));
        }
      }
    }
    knownContentEntryIds.current = currentEntryIds;
  }, [contentEntries, copyFeedbackController, shareMenuEntryId, translationCopyFeedbackController]);

  useEffect(() => () => copyFeedbackController.dispose(), [copyFeedbackController]);
  useEffect(() => () => {
    for (const timer of textEditFeedbackTimers.current.values()) clearTimeout(timer);
    textEditFeedbackTimers.current.clear();
  }, []);
  useEffect(() => {
    contentTranslationsMountedRef.current = true;
    return () => {
      contentTranslationsMountedRef.current = false;
      translationRunner.dispose();
      translationCopyFeedbackController.dispose();
    };
  }, [translationCopyFeedbackController, translationRunner]);

  const composerClient = clients.find((c) => c.id === composerClientId) ?? null;
  const composerItem = (() => {
    if (!composerClient || !composerItemKey) return null;
    const kind = composerItemKey.slice(0, 1);
    const id = composerItemKey.slice(2);
    if (kind === 's') return { kind: 'session' as const, item: composerClient.sessions.find((s) => s.id === id) };
    if (kind === 'c') return { kind: 'consultation' as const, item: composerClient.consultations.find((c) => c.id === id) };
    return null;
  })();
  // Mirrors the guard at the top of handleGenerate — kept in sync so the
  // button can show *why* it's inert instead of silently no-opping on tap.
  const canGenerate = !!composerText.trim() || composerPhotos.length > 0 || !!composerItem;

  useEffect(() => {
    if (!navigation) return;

    const source = { sourceType: navigation.sourceType, sourceId: navigation.sourceId };
    const client = clients.find((candidate) => candidate.id === navigation.clientId) ?? null;
    const sourceItem =
      navigation.sourceType === 'session'
        ? client?.sessions.find((session) => session.id === navigation.sourceId) ?? null
        : client?.consultations.find((consultation) => consultation.id === navigation.sourceId) ?? null;

    setComposerClientId(client?.id ?? navigation.clientId);
    setComposerItemKey(contentComposerItemKey(source));
    setFilterClientId(client?.id ?? 'all');
    setVisibleEntryLimit(CONTENT_ENTRY_PAGE_SIZE);

    if (navigation.mode === 'compose') {
      setFocusedSource(null);
      const sourceText = sourceItem
        ? navigation.sourceType === 'session'
          ? (sourceItem as Session).note
          : [
              (sourceItem as Consultation).generalNotes,
              (sourceItem as Consultation).feeling,
              (sourceItem as Consultation).creative,
              (sourceItem as Consultation).inspirationSources,
            ]
              .filter(Boolean)
              .join('\n\n')
        : '';
      setComposerText(sourceText);
      setComposerTextArchetype('');
      setComposerPhotos(sourceItem ? [...sourceItem.photos] : []);
    } else {
      setFocusedSource(source);
      requestAnimationFrame(() => entriesListRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }

    onNavigationApplied();
  }, [clients, navigation, onNavigationApplied]);

  // Раскрыть конкретную запись по entry.id (клик по карточке контента на
  // экране проекта) — резолвится через ту же чистую функцию, что и её
  // тесты (resolveContentFocusEntry), а не второй ad-hoc find() здесь.
  useEffect(() => {
    if (!focusEntryId) return;
    const target = resolveContentFocusEntry(contentEntries, focusEntryId);
    if (target) {
      setFocusedSource(null);
      setFilterClientId('all');
      const targetIndex = contentEntries
        .filter((entry) => !entry.removedFromWorkspace || entry.id === target.id)
        .findIndex((entry) => entry.id === target.id);
      setVisibleEntryLimit(Math.max(CONTENT_ENTRY_PAGE_SIZE, targetIndex + 1));
      setHighlightedEntryId(target.id);
      setRevealedEntryId(target.id);
      requestAnimationFrame(() => {
        document.getElementById(`content-entry-${target.id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    }
    onFocusEntryApplied();
  }, [contentEntries, focusEntryId, onFocusEntryApplied]);

  useEffect(() => {
    if (!highlightedEntryId) return;
    const timer = setTimeout(() => setHighlightedEntryId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightedEntryId]);

  const resetComposer = () => {
    setComposerText('');
    setComposerTextArchetype('');
    setComposerPhotos([]);
  };

  const handleGenerate = async () => {
    if (!composerText.trim() && composerPhotos.length === 0 && !composerItem) return;
    setSending(true);
    setError(null);
    try {
      const clientName = composerClient ? `${composerClient.name} ${composerClient.surname}`.trim() : '';
      const linkedItem = composerItem?.item;
      const sourceType: 'session' | 'consultation' | 'freeform' =
        composerItem?.kind === 'session' ? 'session' : composerItem?.kind === 'consultation' ? 'consultation' : 'freeform';
      const sourceId = linkedItem?.id ?? null;
      const zone = linkedItem ? (linkedItem as Session & Consultation).area : '';
      const style = linkedItem?.style ?? '';
      const work = composerItem?.kind === 'session' ? (linkedItem as Session).name : undefined;
      const noteFallback =
        composerItem?.kind === 'session'
          ? (linkedItem as Session).note
          : composerItem?.kind === 'consultation'
          ? [
              (linkedItem as Consultation).generalNotes,
              (linkedItem as Consultation).feeling,
              (linkedItem as Consultation).creative,
              (linkedItem as Consultation).inspirationSources,
            ]
              .filter(Boolean)
              .join('\n\n')
          : '';
      const description = composerText.trim() || noteFallback;
      const rawPhotos = composerPhotos.length > 0 ? composerPhotos : linkedItem?.photos ?? [];
      const photoIds = createContentPhotoIds(rawPhotos.length);
      // ContentEntry — отдельная постоянная запись в IndexedDB
      // ('contentEntries'), не ссылка на сессию: её photos переживают
      // удаление или правку исходной сессии (нужно для уже сгенерированного
      // контента), а значит это НАВСЕГДА второй экземпляр тех же байт — и
      // каждый повторный «Отправить» по одной сессии (перегенерация с новым
      // текстом создаёт новый entryId) добавляет ещё один. См.
      // downsizeForContentDuplicate — раз это заведомый дубль, а не
      // единственная копия, ему незачем весить как Session.photos.
      const storedPhotoResults = await downsizePhotosSequentially(rawPhotos, photoIds, (photo) => downsizeForContentDuplicate(photo).catch(() => photo));
      const photos = storedPhotoResults.map((p) => p.preview_data_url);
      const selectedTextArchetype = ARCHETYPE_CHIPS.find((preset) => preset.label === composerTextArchetype);
      const masterInstruction = photos.length > 0
        ? buildInitialContentInstruction(selectedTextArchetype?.instruction)
        : selectedTextArchetype?.instruction;
      const existingIds = [
        ...contentEntriesRef.current,
        ...createIngestJobs.map((job) => ({ id: job.entry.id })),
      ];
      const entryId = createContentEntryId(existingIds);
      const createdDate = new Date().toISOString();
      const sessionId = sourceId ?? `freeform-${entryId}`;
      const context = { client: clientName, work, zone, style, description };
      const previews = await downsizePhotosSequentially(photos, photoIds);
      const params: ContentIngestParams = {
        sessionId,
        sourceType,
        session: context,
        media: previews,
        masterInstruction,
      };
      const created = await createContentIngestJob(params);
      const record: ContentCreateJobRecord = {
        id: `create:${entryId}`,
        jobId: created.jobId,
        operation: 'create',
        state: 'queued',
        createdAt: createdDate,
        updatedAt: createdDate,
        request: {
          sessionId,
          sourceType,
          session: context,
          mediaIds: photoIds,
          masterInstruction,
        },
        entry: {
          id: entryId,
          createdDate,
          clientId: composerClientId,
          sourceType,
          sourceId,
          format: null,
          text: composerText,
          context,
          textArchetype: selectedTextArchetype?.label ?? null,
          photos,
          photoIds,
        },
      };
      await onSaveContentIngestJob(record);
      resetComposer();
    } catch (generationError) {
      setError(generationError instanceof ContentSyncError ? generationError.message : 'Не удалось отправить материал в contentINKA.');
    } finally {
      setSending(false);
    }
  };

  const regenerate = async (entry: ContentEntry, instruction: string, selectedArchetype?: string) => {
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    if (currentEntry.status === 'confirmed' || hasUnsavedTextEdit(currentEntry) || isEntryRefreshing(currentEntry.id)) return;
    setError(null);
    setRefreshFeedbackByEntry((current) => {
      const next = { ...current };
      delete next[entry.id];
      return next;
    });
    try {
      const primaryTextArchetype = ARCHETYPE_CHIPS.find((preset) => preset.label === currentEntry.textArchetype);
      const requestPhotoIds =
        currentEntry.photoIds?.length === currentEntry.photos.length
          ? currentEntry.photoIds
          : currentEntry.contentDraft?.length === currentEntry.photos.length
            ? currentEntry.contentDraft.map((media) => media.id)
            : currentEntry.photos.map((_, index) => `${currentEntry.id}-${index}`);
      const previews = await downsizePhotosSequentially(currentEntry.photos, requestPhotoIds);
      const masterInstruction = instruction || primaryTextArchetype?.instruction;
      const params: ContentIngestParams = {
        sessionId: currentEntry.sourceId ?? currentEntry.id,
        sourceType: currentEntry.sourceType,
        session: currentEntry.context,
        media: previews,
        masterInstruction,
        previousDraft: currentEntry.textDraft || undefined,
      };
      const created = await createContentIngestJob(params);
      const now = new Date().toISOString();
      await onSaveContentIngestJob({
        id: `refresh:${currentEntry.id}`,
        jobId: created.jobId,
        operation: 'refresh',
        state: 'queued',
        createdAt: now,
        updatedAt: now,
        request: {
          sessionId: params.sessionId,
          sourceType: params.sourceType,
          session: params.session,
          mediaIds: requestPhotoIds,
          masterInstruction,
          previousDraft: currentEntry.textDraft || undefined,
        },
        entryId: currentEntry.id,
        baseTextDraft: currentEntry.textDraft,
        requestedArchetype: selectedArchetype ?? null,
      });
      if (selectedArchetype) {
        setSelectedArchetypeByEntry((current) => ({ ...current, [entry.id]: selectedArchetype }));
      }
    } catch (refreshError) {
      setRefreshFeedbackByEntry((current) => ({
        ...current,
        [entry.id]: {
          kind: 'error',
          message: refreshError instanceof ContentSyncError ? refreshError.message : 'Не удалось отправить обновление в contentINKA.',
        },
      }));
    }
  };

  const retryContentJob = async (job: ContentIngestJobRecord) => {
    if (retryingJobIds.has(job.id) || job.retryable === false) return;
    setRetryingJobIds((current) => new Set(current).add(job.id));
    try {
      const entry = job.operation === 'create'
        ? null
        : contentEntriesRef.current.find((candidate) => candidate.id === job.entryId) ?? null;
      if (job.operation === 'refresh' && !entry) {
        await onDeleteContentIngestJob(job.id);
        return;
      }
      const photos = job.operation === 'create' ? job.entry.photos : entry?.photos ?? [];
      const mediaIds = job.operation === 'create'
        ? job.entry.photoIds
        : entry?.photoIds?.length === photos.length
          ? entry.photoIds
          : job.request.mediaIds;
      const previewIds = photos.map((_, index) => mediaIds[index] ?? `${job.id}-${index}`);
      const previews = await downsizePhotosSequentially(photos, previewIds);
      const created = await createContentIngestJob({
        sessionId: job.request.sessionId,
        sourceType: job.request.sourceType,
        session: job.request.session,
        media: previews,
        masterInstruction: job.request.masterInstruction,
        previousDraft: job.request.previousDraft,
      });
      await onSaveContentIngestJob({
        ...job,
        jobId: created.jobId,
        state: 'queued',
        updatedAt: new Date().toISOString(),
        error: undefined,
        retryable: undefined,
      });
    } catch (retryError) {
      setError(retryError instanceof ContentSyncError ? retryError.message : 'Не удалось повторить задачу contentINKA.');
    } finally {
      setRetryingJobIds((current) => {
        const next = new Set(current);
        next.delete(job.id);
        return next;
      });
    }
  };

  const copyContentDraft = async (entry: ContentEntry) => {
    if (!entry.textDraft.trim()) return;
    const attempt = copyFeedbackController.begin(entry.id);
    try {
      const copied = await copyTextToClipboard(entry.textDraft);
      if (copied) copyFeedbackController.finish(entry.id, attempt, 'success');
    } catch {
      copyFeedbackController.finish(entry.id, attempt, 'error');
    }
  };

  const toggleTranslationMenu = (entryId: string) => {
    const entry = contentEntriesRef.current.find((candidate) => candidate.id === entryId);
    if (entry && (hasUnsavedTextEdit(entry) || isEntryRefreshing(entry.id))) return;
    setTranslationMenuEntryIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const translateEntry = async (entry: ContentEntry, language: ContentTranslationLanguage) => {
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    if (hasUnsavedTextEdit(currentEntry) || isEntryRefreshing(currentEntry.id) || !currentEntry.textDraft.trim() || currentContentTranslation(currentEntry, language)) return;
    if (translationRunner.isRunning(currentEntry.id, language)) return;

    const key = contentTranslationKey(currentEntry.id, language);
    setTranslationFeedbackByKey((current) => ({
      ...current,
      [key]: { state: 'loading', message: 'Перевожу…', sourceText: currentEntry.textDraft },
    }));

    try {
      const outcome = await translationRunner.run({
        entry: currentEntry,
        language,
        request: () => translateContentText({ sourceText: currentEntry.textDraft, targetLanguage: language }),
        getCurrentEntry: () => contentEntriesRef.current.find((candidate) => candidate.id === currentEntry.id) ?? currentEntry,
        save: saveEntryInWorkspace,
      });
      if (outcome.status === 'ignored' || !contentTranslationsMountedRef.current) return;
      setTranslationFeedbackByKey((current) => ({
        ...current,
        [key]: { state: 'success', message: 'Перевод готов', sourceText: currentEntry.textDraft },
      }));
    } catch (translationError) {
      if (!contentTranslationsMountedRef.current) return;
      setTranslationFeedbackByKey((current) => ({
        ...current,
        [key]: {
          state: 'error',
          message: translationError instanceof ContentSyncError ? translationError.message : 'Не удалось перевести текст.',
          sourceText: currentEntry.textDraft,
        },
      }));
    }
  };

  const copyContentTranslation = async (entry: ContentEntry, language: ContentTranslationLanguage) => {
    const translation = entry.translations?.[language];
    if (!translation?.translatedText.trim()) return;

    const key = contentTranslationKey(entry.id, language);
    const attempt = translationCopyFeedbackController.begin(key);
    try {
      const copied = await copyTextToClipboard(translation.translatedText);
      if (copied && contentTranslationsMountedRef.current) {
        translationCopyFeedbackController.finish(key, attempt, 'success');
      }
    } catch {
      if (contentTranslationsMountedRef.current) {
        translationCopyFeedbackController.finish(key, attempt, 'error');
      }
    }
  };

  const deleteContentEntry = (entryId: string) => {
    copyFeedbackController.clear(entryId);
    for (const option of CONTENT_TRANSLATION_OPTIONS) {
      translationCopyFeedbackController.clear(contentTranslationKey(entryId, option.language));
    }
    setTranslationFeedbackByKey((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !CONTENT_TRANSLATION_OPTIONS.some((option) => key === contentTranslationKey(entryId, option.language))),
      ),
    );
    // A linked entry is still shown inside its project/session — "Удалить"
    // here should only take it out of contentINKA's own draft list, not erase
    // the content the project already points at. Only truly unlinked drafts
    // get hard-deleted (nothing else references them, nothing to keep).
    const entry = contentEntriesRef.current.find((candidate) => candidate.id === entryId);
    if (entry && isContentEntryLinked(entry)) {
      const hidden: ContentEntry = { ...entry, removedFromWorkspace: true };
      contentEntriesRef.current = contentEntriesRef.current.map((candidate) => (candidate.id === entryId ? hidden : candidate));
      onSaveEntry(hidden);
      return;
    }
    contentEntriesRef.current = contentEntriesRef.current.filter((entry) => entry.id !== entryId);
    onDeleteEntry(entryId);
  };

  const contentPublicationSets = (entry: ContentEntry) =>
    resolveContentPhotoPublicationSets({
      photos: entry.photos,
      photoIds: entry.photoIds,
      contentDraft: entry.contentDraft,
    });

  const contentSharePhotos = (
    entry: ContentEntry,
    target: 'carousel' | 'stories',
  ): ContentSharePhoto[] =>
    contentPublicationSets(entry)[target].map((photo) => ({
      src: photo.src,
      originalIndex: photo.originalIndex,
    }));

  const openContentShareMenu = (entryId: string) => {
    setShareFeedbackByEntry((current) => {
      const next = { ...current };
      delete next[entryId];
      return next;
    });
    setShareMenuEntryId(entryId);
  };

  const shareContentToInstagram = async (
    entry: ContentEntry,
    target: 'carousel' | 'stories',
  ) => {
    setShareMenuEntryId(null);
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    const preparation = prepareInstagramContentShare({
      entryId: currentEntry.id,
      savedText: currentEntry.textDraft,
      photos: contentSharePhotos(currentEntry, target),
    });

    if (preparation.status === 'no_photo') {
      const targetLabel = target === 'carousel' ? 'карусели' : 'сториз';
      setShareFeedbackByEntry((current) => ({
        ...current,
        [entry.id]: { kind: 'error', message: 'В подборке для ' + targetLabel + ' нет фотографий' },
      }));
      return;
    }
    if (preparation.status === 'invalid_photo') {
      setShareFeedbackByEntry((current) => ({
        ...current,
        [entry.id]: { kind: 'error', message: 'Не удалось подготовить исходное фото для Instagram' },
      }));
      return;
    }

    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
    const canShareFile = canShareInstagramContent(
      preparation,
      nav.canShare ? (data) => nav.canShare?.(data) === true : undefined,
    );
    if (!canShareFile || typeof nav.share !== 'function') {
      setShareFeedbackByEntry((current) => ({
        ...current,
        [entry.id]: { kind: 'error', message: 'Этот браузер не поддерживает передачу фото в системное меню' },
      }));
      return;
    }

    // Both permission-sensitive calls start in the same direct user gesture.
    const copyPromise = copyTextToClipboard(preparation.clipboardText);
    let sharePromise: Promise<void>;
    try {
      sharePromise = nav.share(preparation.payload);
    } catch (shareError) {
      const copied = await copyPromise.catch(() => false);
      if (copied) {
        setShareFeedbackByEntry((current) => ({
          ...current,
          [entry.id]: { kind: 'success', message: 'Текст скопирован — вставьте его в Instagram' },
        }));
      }
      if (!isShareAbortError(shareError)) {
        setShareFeedbackByEntry((current) => ({
          ...current,
          [entry.id]: {
            kind: 'error',
            message: copied
              ? 'Текст скопирован — вставьте его в Instagram. Не удалось открыть системное меню фото.'
              : 'Не удалось открыть системное меню Instagram',
          },
        }));
      }
      return;
    }

    let copied = false;
    try {
      copied = await copyPromise;
      if (copied) {
        setShareFeedbackByEntry((current) => ({
          ...current,
          [entry.id]: { kind: 'success', message: 'Текст скопирован — вставьте его в Instagram' },
        }));
      }
    } catch {
      setShareFeedbackByEntry((current) => ({
        ...current,
        [entry.id]: { kind: 'error', message: 'Фото готово, но текст не удалось скопировать' },
      }));
    }

    try {
      await sharePromise;
    } catch (shareError) {
      if (isShareAbortError(shareError)) return;
      setShareFeedbackByEntry((current) => ({
        ...current,
        [entry.id]: {
          kind: 'error',
          message: copied
            ? 'Текст скопирован — вставьте его в Instagram. Не удалось передать фото.'
            : 'Не удалось передать фото в системное меню',
        },
      }));
    }
  };

  const shareContentToOtherApps = async (entry: ContentEntry) => {
    setShareMenuEntryId(null);
    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;
    await shareContentEntry(currentEntry.id, currentEntry.photos, currentEntry.textDraft);
  };

  // ContentEntryCard intentionally ignores the freshly-created children prop
  // while its per-entry revision is unchanged. Keep every event handler inside
  // those children stable and delegate to the latest render's implementation,
  // so memoization cannot retain stale state or parent callbacks.
  const contentCardActionHandlersRef = useRef({
    updateExemplar,
    approveEntry,
    openLinkPicker,
    saveTextEdit,
    cancelTextEdit,
    startTextEdit,
    copyContentTranslation,
    translateEntry,
    regenerate,
    retryContentJob,
    onDeleteContentIngestJob,
    copyContentDraft,
    toggleTranslationMenu,
    openContentShareMenu,
    deleteContentEntry,
    shareContentToInstagram,
    shareContentToOtherApps,
  });
  contentCardActionHandlersRef.current = {
    updateExemplar,
    approveEntry,
    openLinkPicker,
    saveTextEdit,
    cancelTextEdit,
    startTextEdit,
    copyContentTranslation,
    translateEntry,
    regenerate,
    retryContentJob,
    onDeleteContentIngestJob,
    copyContentDraft,
    toggleTranslationMenu,
    openContentShareMenu,
    deleteContentEntry,
    shareContentToInstagram,
    shareContentToOtherApps,
  };
  const contentCardActions = useMemo(() => ({
    updateExemplar: (entry: ContentEntry, value: boolean) => contentCardActionHandlersRef.current.updateExemplar(entry, value),
    approveEntry: (entry: ContentEntry) => contentCardActionHandlersRef.current.approveEntry(entry),
    openLinkPicker: (entryId: string) => contentCardActionHandlersRef.current.openLinkPicker(entryId),
    saveTextEdit: (entry: ContentEntry) => contentCardActionHandlersRef.current.saveTextEdit(entry),
    cancelTextEdit: (entryId: string) => contentCardActionHandlersRef.current.cancelTextEdit(entryId),
    startTextEdit: (entry: ContentEntry) => contentCardActionHandlersRef.current.startTextEdit(entry),
    copyContentTranslation: (entry: ContentEntry, language: ContentTranslationLanguage) =>
      contentCardActionHandlersRef.current.copyContentTranslation(entry, language),
    translateEntry: (entry: ContentEntry, language: ContentTranslationLanguage) =>
      contentCardActionHandlersRef.current.translateEntry(entry, language),
    regenerate: (entry: ContentEntry, instruction: string, selectedArchetype?: string) =>
      contentCardActionHandlersRef.current.regenerate(entry, instruction, selectedArchetype),
    retryContentJob: (job: ContentIngestJobRecord) => contentCardActionHandlersRef.current.retryContentJob(job),
    deleteContentIngestJob: (jobId: string) => contentCardActionHandlersRef.current.onDeleteContentIngestJob(jobId),
    copyContentDraft: (entry: ContentEntry) => contentCardActionHandlersRef.current.copyContentDraft(entry),
    toggleTranslationMenu: (entryId: string) => contentCardActionHandlersRef.current.toggleTranslationMenu(entryId),
    openContentShareMenu: (entryId: string) => contentCardActionHandlersRef.current.openContentShareMenu(entryId),
    deleteContentEntry: (entryId: string) => contentCardActionHandlersRef.current.deleteContentEntry(entryId),
    shareContentToInstagram: (entry: ContentEntry, target: 'carousel' | 'stories') =>
      contentCardActionHandlersRef.current.shareContentToInstagram(entry, target),
    shareContentToOtherApps: (entry: ContentEntry) => contentCardActionHandlersRef.current.shareContentToOtherApps(entry),
  }), []);

  // Linked entries "deleted" from contentINKA (see deleteContentEntry above)
  // stay in the store but drop out of this workspace's own list — except
  // the one explicitly being focused (opened from its linked project/
  // session via focusEntryId below), which still needs to render so the
  // scroll-into-view/highlight effect has something to find. focusEntryId
  // itself is a one-shot command the parent clears right after the effect
  // applies it (onFocusEntryApplied), in the same update batch — so by the
  // time this filter runs again it's already back to null. revealedEntryId
  // is the effect's own record of which entry it resolved, and survives
  // that reset for as long as this screen stays mounted.
  const workspaceEntries = contentEntries.filter(
    (entry) => !entry.removedFromWorkspace || entry.id === focusEntryId || entry.id === revealedEntryId,
  );
  const visibleEntries = selectContentWorkspaceEntries({
    entries: workspaceEntries,
    clientFilter: filterClientId,
    focusedSource,
  });
  const pagedVisibleEntries = visibleEntries.slice(0, visibleEntryLimit);

  const clientLabel = (clientId: string | null) => {
    if (clientId === null) return 'Мастерская';
    const c = clients.find((x) => x.id === clientId);
    return c ? `${c.name} ${c.surname}`.trim() : '—';
  };

  return (
    <div style={{ minHeight: '100%' }}>
      <div style={{ height: 'calc(env(safe-area-inset-top) + 18px)' }} />
      {/* ── Шапка ContentINKA ── */}
      <div style={{ padding: '6px 24px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div className="inka-back" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: fs(15), color: COLORS.gold, fontStyle: 'italic', letterSpacing: '0.3px' }}>вернуться</span>
          </div>
          <TodayDateBadge onOpen={onOpenCalendar} />
        </div>
        <InkaLogo height={fs(15)} />
        <div style={{ fontSize: fs(24), color: COLORS.textPrimary, fontWeight: 300, letterSpacing: '1px', marginTop: 6 }}>contentINKA</div>
        <div style={{ fontSize: fs(13), color: COLORS.textGhost, marginTop: 2 }}>Собрать материал</div>
        <StarDivider />
      </div>

      <div style={{ padding: '0 24px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ── Верхний toolbar архетипов: основной текстовый архетип НОВОЙ генерации ── */}
        <div>
          <div className="content-archetype-label">
            {composerTextArchetype ? `Голос текста · ${composerTextArchetype}` : 'Голос текста · Инка выберет сама'}
          </div>
          <ArchetypeToolbar
            chips={ARCHETYPE_CHIPS}
            value={composerTextArchetype || null}
            disabled={sending}
            allowClear
            ariaLabel="Основной текстовый архетип новой публикации"
            onSelect={setComposerTextArchetype}
          />
        </div>


        {createIngestJobs.length > 0 && (
          <GoldFrame plain style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.4px', marginBottom: 10 }}>В работе</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {createIngestJobs.map((job) => (
                <div key={job.id} style={{ borderTop: '1px solid rgba(var(--gold-rgb),0.14)', paddingTop: 10 }}>
                  <div style={{ fontSize: fs(13), color: COLORS.textPrimary }}>
                    {job.state === 'failed' ? 'Не удалось собрать материал' : 'contentINKA собирает материал…'}
                  </div>
                  <div style={{ fontSize: fs(11), color: COLORS.textGhost, marginTop: 3 }}>
                    {clientLabel(job.entry.clientId)} · {job.entry.sourceType === 'session' ? 'сессия' : job.entry.sourceType === 'consultation' ? 'консультация' : 'свободный материал'}
                  </div>
                  {job.state === 'failed' ? (
                    <>
                      <div className="content-refresh-feedback is-error" role="alert">{job.error ?? 'Задача завершилась ошибкой'}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        {job.retryable !== false && (
                          <button type="button" onClick={() => retryContentJob(job)} disabled={retryingJobIds.has(job.id)}>
                            {retryingJobIds.has(job.id) ? 'Повторяю…' : 'Повторить'}
                          </button>
                        )}
                        <button type="button" onClick={() => onDeleteContentIngestJob(job.id)}>Удалить</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
                      <span style={{ fontSize: fs(11), color: COLORS.textGhost }}>Можно перейти в другой раздел</span>
                      <button type="button" onClick={() => onDeleteContentIngestJob(job.id)}>Отменить</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </GoldFrame>
        )}

        {/* ── Composer ── */}
        <GoldFrame plain style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: fs(12), color: COLORS.gold, letterSpacing: '0.3px', marginBottom: 10 }}>Новая запись</div>

          <select
            value={composerClientId ?? ''}
            onChange={(e) => {
              setComposerClientId(e.target.value || null);
              setComposerItemKey('');
            }}
            style={{ ...INPUT_STYLE, marginBottom: 10 }}
          >
            <option value="">Мастерская (без клиента)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {`${c.name} ${c.surname}`.trim()}
              </option>
            ))}
          </select>

          {composerClient && (composerClient.sessions.length > 0 || composerClient.consultations.length > 0) && (
            <select value={composerItemKey} onChange={(e) => setComposerItemKey(e.target.value)} style={{ ...INPUT_STYLE, marginBottom: 10 }}>
              <option value="">Без привязки к сессии</option>
              {composerClient.sessions.map((s) => (
                <option key={`s:${s.id}`} value={`s:${s.id}`}>
                  Сессия · {s.name || formatDate(s.date) || 'без названия'}
                </option>
              ))}
              {composerClient.consultations.map((c) => (
                <option key={`c:${c.id}`} value={`c:${c.id}`}>
                  Консультация · {formatDate(c.date) || 'без даты'}
                </option>
              ))}
            </select>
          )}

          <textarea
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            placeholder="Тема, мысль, инструкция — свободный ввод"
            rows={4}
            style={{ ...INPUT_STYLE, marginBottom: 10, resize: 'vertical', fontFamily: "'Inter', sans-serif" }}
          />

          <SessionPhotos photos={composerPhotos} onChange={setComposerPhotos} allowDelete buttonFirst />

          <div
            className="inka-submit"
            onClick={sending || !canGenerate ? undefined : handleGenerate}
            style={{
              ...SUBMIT_STYLE,
              marginTop: 12,
              opacity: sending ? 0.6 : canGenerate ? 1 : 0.4,
              cursor: sending || !canGenerate ? 'default' : 'pointer',
            }}
          >
            {sending ? 'Отправляю…' : 'Сгенерировать'}
          </div>
          {!sending && !canGenerate && (
            <div style={{ fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', marginTop: 6 }}>
              Впишите тему, добавьте фото или выберите сессию/консультацию.
            </div>
          )}
          {error && <div style={{ fontSize: fs(12), color: 'var(--urgent, #c0392b)', marginTop: 8 }}>{error}</div>}
        </GoldFrame>

        {/* ── Filter ── */}
        <select
          aria-label="Фильтр записей"
          value={filterClientId}
          onChange={(e) => {
            setFocusedSource(null);
            setFilterClientId(e.target.value);
            setVisibleEntryLimit(CONTENT_ENTRY_PAGE_SIZE);
          }}
          style={INPUT_STYLE}
        >
          <option value="all">Все</option>
          <option value="studio">Мастерская</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {`${c.name} ${c.surname}`.trim()}
            </option>
          ))}
        </select>

        {/* ── List ── */}
        <div ref={entriesListRef} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {focusedSource && (
            <div className="content-linked-heading">
              <span>Связанные черновики · {visibleEntries.length}</span>
              <button type="button" onClick={() => {
                setFocusedSource(null);
                setVisibleEntryLimit(CONTENT_ENTRY_PAGE_SIZE);
              }}>
                Показать все
              </button>
            </div>
          )}
          {visibleEntries.length === 0 && (
            <div style={{ fontSize: fs(14), color: COLORS.textGhost, fontStyle: 'italic' }}>Пока пусто.</div>
          )}
          {pagedVisibleEntries.map((entry) => {
            const revision = createContentEntryCardRevision(entry.id, [
              refreshingEntryIds.has(entry.id),
              refreshJobByEntry.get(entry.id),
              selectedArchetypeByEntry[entry.id],
              textEditorsByEntry[entry.id],
              textEditFeedbackByEntry[entry.id],
              copyFeedbackByEntry[entry.id],
              translationMenuEntryIds.has(entry.id),
              CONTENT_TRANSLATION_OPTIONS.map((option) => {
                const key = contentTranslationKey(entry.id, option.language);
                return [translationFeedbackByKey[key], translationCopyFeedbackByKey[key]];
              }),
              shareMenuEntryId === entry.id,
              shareFeedbackByEntry[entry.id],
            ], refreshFeedbackByEntry);
            return (
            <ContentEntryCard
              key={entry.id}
              entry={entry}
              highlighted={highlightedEntryId === entry.id}
              clients={clients}
              projects={projects}
              revision={revision}
            >
              <div className="content-card-header">
                <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '0.5px' }}>
                  {clientLabel(entry.clientId)}
                  {entry.format === 'story' ? ' · сторис' : ''}
                </div>
                <div className="content-approval-row">
                  {entry.status === 'confirmed' ? (
                    <>
                      <span className="content-approved-status">Одобрено</span>
                      <label className={`content-exemplar-toggle${entry.isExemplar ? ' is-active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={entry.isExemplar}
                          onChange={(event) => contentCardActions.updateExemplar(entry, event.target.checked)}
                        />
                        <span>Эталон</span>
                      </label>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="content-approve-action"
                      disabled={!entry.textDraft.trim() || hasUnsavedTextEdit(entry) || isEntryRefreshing(entry.id)}
                      onClick={() => contentCardActions.approveEntry(entry)}
                    >
                      Одобрить текст
                    </button>
                  )}
                </div>
                <ContentLinkStatus
                  entry={entry}
                  projects={projects}
                  clients={clients}
                  onOpenPicker={() => contentCardActions.openLinkPicker(entry.id)}
                />
              </div>
              {hasUnsavedTextEdit(entry) && (
                <div className="content-text-edit-guard">Сначала сохраните или отмените правки</div>
              )}
              <ContentPhotoGallery entry={entry} />
              {entry.status === 'draft' && textEditorsByEntry[entry.id] ? (
                <div className="content-text-editor">
                  <textarea
                    value={textEditorsByEntry[entry.id].editedText}
                    onChange={(event) => setTextEditorsByEntry((current) => ({
                      ...current,
                      [entry.id]: {
                        baseText: current[entry.id]?.baseText ?? entry.textDraft,
                        editedText: event.target.value,
                      },
                    }))}
                    rows={8}
                    dir="auto"
                    autoFocus
                    aria-label="Текст публикации"
                    aria-invalid={contentTextLength(textEditorsByEntry[entry.id].editedText.trim()) > MAX_CONTENT_TEXT_CHARACTERS}
                  />
                  <div className="content-text-editor__meta">
                    <span className={hasUnsavedTextEdit(entry) ? 'is-dirty' : ''}>
                      {hasUnsavedTextEdit(entry) ? 'Не сохранено' : 'Без изменений'}
                    </span>
                  </div>
                  {contentTextLength(textEditorsByEntry[entry.id].editedText.trim()) > MAX_CONTENT_TEXT_CHARACTERS && (
                    <div className="content-text-edit-feedback is-error" role="alert">
                      Сократите текст вручную до 650 символов
                    </div>
                  )}
                  {textEditFeedbackByEntry[entry.id] && (
                    <div className={`content-text-edit-feedback is-${textEditFeedbackByEntry[entry.id].kind}`} role="alert">
                      {textEditFeedbackByEntry[entry.id].message}
                    </div>
                  )}
                  <div className="content-text-editor__actions">
                    <ActionButton
                      icon="save"
                      label="Сохранить"
                      variant="primary"
                      disabled={
                        !textEditorsByEntry[entry.id].editedText.trim() ||
                        contentTextLength(textEditorsByEntry[entry.id].editedText.trim()) > MAX_CONTENT_TEXT_CHARACTERS
                      }
                      onClick={() => contentCardActions.saveTextEdit(entry)}
                    />
                    <ActionButton icon="cancel" label="Отмена" onClick={() => contentCardActions.cancelTextEdit(entry.id)} />
                  </div>
                </div>
              ) : entry.textDraft ? (
                <div className="content-text-output">
                  <div dir="auto" className="content-text-output__body">{entry.textDraft}</div>
                  {entry.status === 'draft' && !isEntryRefreshing(entry.id) && (
                    <ActionButton icon="edit" label="Редактировать" onClick={() => contentCardActions.startTextEdit(entry)} />
                  )}
                </div>
              ) : null}
              {!textEditorsByEntry[entry.id] && textEditFeedbackByEntry[entry.id] && (
                <div className={`content-text-edit-feedback is-${textEditFeedbackByEntry[entry.id].kind}`} role="status">
                  {textEditFeedbackByEntry[entry.id].message}
                </div>
              )}
              {CONTENT_TRANSLATION_OPTIONS.map((option) => {
                const translation = entry.translations?.[option.language];
                if (!translation) return null;
                const key = contentTranslationKey(entry.id, option.language);
                const isStale = isContentTranslationStale(entry, option.language);
                const feedback = translationFeedbackByKey[key];
                const copyFeedback = translationCopyFeedbackByKey[key];
                return (
                  <div key={option.language} className={`content-translation-block${isStale ? ' is-stale' : ''}`}>
                    <div className="content-translation-block__heading">
                      <span>{option.title}</span>
                      {isStale && <span>Перевод предыдущей версии</span>}
                    </div>
                    <div
                      className="content-translation-block__text"
                      dir={option.dir}
                      lang={option.language}
                    >
                      {translation.translatedText}
                    </div>
                    <div className="content-translation-block__actions">
                      <button type="button" onClick={() => contentCardActions.copyContentTranslation(entry, option.language)}>
                        {copyFeedback === 'success'
                          ? 'Скопировано'
                          : copyFeedback === 'error'
                            ? 'Не удалось скопировать'
                            : 'Копировать перевод'}
                      </button>
                      {isStale && (
                        <button
                          type="button"
                          disabled={feedback?.state === 'loading' || !entry.textDraft.trim() || hasUnsavedTextEdit(entry) || isEntryRefreshing(entry.id)}
                          onClick={() => contentCardActions.translateEntry(entry, option.language)}
                        >
                          {feedback?.state === 'loading' ? 'Перевожу…' : 'Обновить перевод'}
                        </button>
                      )}
                    </div>
                    {isStale && feedback?.state === 'error' && (
                      <div className="content-translation-feedback is-error" role="alert">
                        {feedback.message}
                      </div>
                    )}
                  </div>
                );
              })}
              {(entry.textArchetype || entry.visualArchetype || entry.textTriad) && (
                <div className="content-archetype-context">
                  {entry.textArchetype && <div>Основной текстовый архетип · {entry.textArchetype}</div>}
                  {entry.visualArchetype && <div>Визуальный архетип · {entry.visualArchetype}</div>}
                  {entry.textTriad && (
                    <div>
                      Текстовая триада · {entry.textTriad.opens} · {entry.textTriad.leads} · {entry.textTriad.closes}
                    </div>
                  )}
                </div>
              )}
              <div className="content-archetype-label">
                Голос текста — перегенерировать
              </div>
              <ArchetypeToolbar
                chips={ARCHETYPE_CHIPS}
                value={selectedArchetypeByEntry[entry.id] ?? null}
                disabled={entry.status === 'confirmed' || refreshingEntryIds.has(entry.id) || hasUnsavedTextEdit(entry)}
                ariaLabel="Перегенерировать текст публикации"
                onSelect={(label) => {
                  const preset = ARCHETYPE_CHIPS.find((candidate) => candidate.label === label);
                  if (preset) contentCardActions.regenerate(entry, preset.instruction, preset.label);
                }}
              />
              {entry.status === 'draft' && (
                <div className="content-refresh-row">
                  {refreshJobByEntry.get(entry.id)?.state !== 'failed' && refreshJobByEntry.has(entry.id) && (
                    <div className="content-refresh-feedback" role="status">contentINKA обновляет черновик… Можно перейти в другой раздел.</div>
                  )}
                  {refreshJobByEntry.get(entry.id)?.state === 'failed' && (
                    <div className="content-refresh-feedback is-error" role="alert">
                      {refreshJobByEntry.get(entry.id)?.error ?? 'Не удалось обновить черновик'}
                      <div style={{ display: 'flex', gap: 8, marginTop: 7 }}>
                        {refreshJobByEntry.get(entry.id)?.retryable !== false && (
                          <button type="button" onClick={() => {
                            const job = refreshJobByEntry.get(entry.id);
                            if (job) contentCardActions.retryContentJob(job);
                          }}>Повторить</button>
                        )}
                        <button type="button" onClick={() => {
                          const job = refreshJobByEntry.get(entry.id);
                          if (job) contentCardActions.deleteContentIngestJob(job.id);
                        }}>Удалить</button>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    className="content-refresh-action"
                    disabled={refreshingEntryIds.has(entry.id) || hasUnsavedTextEdit(entry)}
                    onClick={() => contentCardActions.regenerate(entry, '')}
                  >
                    <span className={refreshingEntryIds.has(entry.id) ? 'is-spinning' : ''} aria-hidden="true">
                      ↻
                    </span>
                    {refreshingEntryIds.has(entry.id) ? 'Обновляю…' : 'Обновить черновик'}
                  </button>
                  {refreshFeedbackByEntry[entry.id] && (
                    <div
                      className={`content-refresh-feedback is-${refreshFeedbackByEntry[entry.id].kind}`}
                      role={refreshFeedbackByEntry[entry.id].kind === 'error' ? 'alert' : 'status'}
                    >
                      {refreshFeedbackByEntry[entry.id].message}
                    </div>
                  )}
                </div>
              )}
              <ContentEntryActions
                primary={
                  <>
                    <button
                      type="button"
                      className={`content-action-button content-copy-action${copyFeedbackByEntry[entry.id] ? ` is-${copyFeedbackByEntry[entry.id]}` : ''}`}
                      aria-label="Копировать текст публикации"
                      aria-live="polite"
                      disabled={!entry.textDraft.trim()}
                      onClick={() => contentCardActions.copyContentDraft(entry)}
                    >
                      {copyFeedbackByEntry[entry.id] === 'success'
                        ? 'Скопировано'
                        : copyFeedbackByEntry[entry.id] === 'error'
                          ? 'Не удалось скопировать'
                          : 'Копировать текст'}
                    </button>
                    <button
                      type="button"
                      className="content-action-button content-translate-action"
                      aria-expanded={translationMenuEntryIds.has(entry.id)}
                      disabled={!entry.textDraft.trim() || hasUnsavedTextEdit(entry)}
                      onClick={() => contentCardActions.toggleTranslationMenu(entry.id)}
                    >
                      Перевести
                    </button>
                    {hasUnsavedTextEdit(entry) && <span className="content-text-edit-guard">Сначала сохраните текст</span>}
                    <button
                      type="button"
                      className="content-action-button content-share-action"
                      onClick={() => contentCardActions.openContentShareMenu(entry.id)}
                    >
                      Поделиться
                    </button>
                  </>
                }
                danger={
                  <ActionButton
                    icon="delete"
                    label="Удалить"
                    variant="danger"
                    onClick={() => contentCardActions.deleteContentEntry(entry.id)}
                  />
                }
              />
              {shareFeedbackByEntry[entry.id] && (
                <div
                  className={`content-share-feedback is-${shareFeedbackByEntry[entry.id].kind}`}
                  role={shareFeedbackByEntry[entry.id].kind === 'error' ? 'alert' : 'status'}
                >
                  {shareFeedbackByEntry[entry.id].message}
                </div>
              )}
              {shareMenuEntryId === entry.id && (
                <ContentShareSheet
                  carouselCount={contentPublicationSets(entry).carousel.length}
                  storiesCount={contentPublicationSets(entry).stories.length}
                  onInstagramCarousel={() => void contentCardActions.shareContentToInstagram(entry, 'carousel')}
                  onInstagramStories={() => void contentCardActions.shareContentToInstagram(entry, 'stories')}
                  onOtherApps={() => void contentCardActions.shareContentToOtherApps(entry)}
                  onClose={() => setShareMenuEntryId(null)}
                />
              )}
              {translationMenuEntryIds.has(entry.id) && (
                <div className="content-translation-menu">
                  {CONTENT_TRANSLATION_OPTIONS.map((option) => {
                    const key = contentTranslationKey(entry.id, option.language);
                    const feedback = translationFeedbackByKey[key];
                    const hasCurrentTranslation = !!currentContentTranslation(entry, option.language);
                    return (
                      <div key={option.language} className="content-translation-menu__option">
                        <button
                          type="button"
                          disabled={!entry.textDraft.trim() || hasUnsavedTextEdit(entry) || feedback?.state === 'loading' || hasCurrentTranslation}
                          onClick={() => contentCardActions.translateEntry(entry, option.language)}
                        >
                          {feedback?.state === 'loading' ? 'Перевожу…' : option.actionLabel}
                        </button>
                        {hasCurrentTranslation && (
                          <span className="content-translation-feedback is-success" role="status">
                            {feedback?.state === 'success' ? feedback.message : 'Перевод актуален'}
                          </span>
                        )}
                        {!hasCurrentTranslation && feedback?.state === 'error' && (
                          <span
                            className="content-translation-feedback is-error"
                            role="alert"
                          >
                            {feedback.message}
                          </span>
                        )}
                        {!hasCurrentTranslation &&
                          feedback?.state === 'success' &&
                          feedback.sourceText === entry.textDraft && (
                            <span className="content-translation-feedback is-success" role="status">
                              {feedback.message}
                            </span>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ContentEntryCard>
            );
          })}
          {pagedVisibleEntries.length < visibleEntries.length && (
            <button
              type="button"
              className="content-filter-chip content-show-more"
              onClick={() => setVisibleEntryLimit((current) => Math.min(current + CONTENT_ENTRY_PAGE_SIZE, visibleEntries.length))}
            >
              Показать ещё
            </button>
          )}
        </div>
      </div>
      <ContentLinkPickerSheet
        open={!!linkPickerEntryId}
        entry={contentEntries.find((e) => e.id === linkPickerEntryId) ?? null}
        projects={projects}
        clients={clients}
        target={linkPickerTarget}
        onTargetChange={setLinkPickerTarget}
        onClose={() => setLinkPickerEntryId(null)}
        onPick={(link) => {
          const entry = contentEntries.find((e) => e.id === linkPickerEntryId);
          if (entry) updateEntryLink(entry, link);
        }}
        onCreateProject={() => {
          const entry = contentEntries.find((e) => e.id === linkPickerEntryId);
          if (!entry) return;
          setLinkPickerEntryId(null);
          onCreateProjectForLink(entry.id, entry.clientId);
        }}
        onCreateSession={() => {
          const entry = contentEntries.find((e) => e.id === linkPickerEntryId);
          if (!entry) return;
          setLinkPickerEntryId(null);
          onCreateSessionForLink(entry.id, entry.clientId);
        }}
      />
    </div>
  );
}
