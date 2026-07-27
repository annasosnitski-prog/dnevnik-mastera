import { readFileSync, writeFileSync } from 'node:fs';

function replaceOrThrow(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing patch target: ${label}`);
  return source.replace(search, replacement);
}

const componentPath = 'src/components/TattoDiary.tsx';
let component = readFileSync(componentPath, 'utf8');

if (
  component.includes('resolveContentPhotoPublicationSets,') &&
  component.includes('Instagram · Карусель') &&
  component.includes("target: 'carousel' | 'stories'")
) {
  console.log('ContentINKA publication UI patch is already applied.');
  process.exit(0);
}

component = replaceOrThrow(
  component,
  `  resolveAllContentPhotos,\n  resolveContentPhotoSelection,\n  type ResolvedContentPhoto,`,
  `  resolveAllContentPhotos,\n  resolveContentPhotoPublicationSets,\n  type ResolvedContentPhoto,`,
  'publication sets import',
);

component = replaceOrThrow(
  component,
  `function ContentShareSheet({\n  onInstagram,\n  onOtherApps,\n  onClose,\n}: {\n  onInstagram: () => void;\n  onOtherApps: () => void;\n  onClose: () => void;\n}) {\n  return createPortal(\n    <div className="content-share-sheet-backdrop" onClick={onClose}>\n      <div\n        className="content-share-sheet"\n        role="dialog"\n        aria-modal="true"\n        aria-label="Поделиться контентом"\n        onClick={(event) => event.stopPropagation()}\n      >\n        <div className="content-share-sheet__title">Поделиться</div>\n        <button type="button" onClick={onInstagram}>Instagram</button>\n        <button type="button" onClick={onOtherApps}>Другие приложения</button>\n        <button type="button" className="content-share-sheet__cancel" onClick={onClose}>Отмена</button>\n      </div>\n    </div>,\n    document.body,\n  );\n}`,
  `function ContentShareSheet({\n  carouselCount,\n  storiesCount,\n  onInstagramCarousel,\n  onInstagramStories,\n  onOtherApps,\n  onClose,\n}: {\n  carouselCount: number;\n  storiesCount: number;\n  onInstagramCarousel: () => void;\n  onInstagramStories: () => void;\n  onOtherApps: () => void;\n  onClose: () => void;\n}) {\n  return createPortal(\n    <div className="content-share-sheet-backdrop" onClick={onClose}>\n      <div\n        className="content-share-sheet"\n        role="dialog"\n        aria-modal="true"\n        aria-label="Поделиться контентом"\n        onClick={(event) => event.stopPropagation()}\n      >\n        <div className="content-share-sheet__title">Поделиться</div>\n        <button type="button" disabled={carouselCount === 0} onClick={onInstagramCarousel}>\n          Instagram · Карусель · {carouselCount}\n        </button>\n        <button type="button" disabled={storiesCount === 0} onClick={onInstagramStories}>\n          Instagram · Сториз · {storiesCount}\n        </button>\n        <button type="button" onClick={onOtherApps}>Другие приложения</button>\n        <button type="button" className="content-share-sheet__cancel" onClick={onClose}>Отмена</button>\n      </div>\n    </div>,\n    document.body,\n  );\n}`,
  'share sheet',
);

component = replaceOrThrow(
  component,
  `  const hasSelectionContract = hasContentPhotoSelectionContract(entry.contentDraft);\n  const selectedPhotos = resolveContentPhotoSelection(input);\n  const allPhotos = resolveAllContentPhotos(input);`,
  `  const hasSelectionContract = hasContentPhotoSelectionContract(entry.contentDraft);\n  const publicationSets = resolveContentPhotoPublicationSets(input);\n  const selectedPhotos = [...publicationSets.carousel, ...publicationSets.stories];\n  const allPhotos = resolveAllContentPhotos(input);`,
  'gallery publication sets',
);

component = replaceOrThrow(
  component,
  `          <div className="content-photo-output__title">Подборка Инки</div>\n          {selectedPhotos.length === 0 ? (\n            <div className="content-photo-output__empty">Инка не выбрала кадры для публикации</div>\n          ) : (\n            <div className="content-photo-selection">\n              {photoButton(selectedPhotos[0], 'content-photo-hero')}\n              {selectedPhotos.length > 1 && (\n                <div className="content-photo-grid">\n                  {selectedPhotos.slice(1).map((photo) => photoButton(photo, 'content-photo-tile'))}\n                </div>\n              )}\n            </div>\n          )}`,
  `          <div className="content-photo-output__title">Подборка Инки</div>\n          {selectedPhotos.length === 0 ? (\n            <div className="content-photo-output__empty">Инка не выбрала кадры для публикации</div>\n          ) : (\n            <div className="content-photo-publication-sets">\n              {publicationSets.carousel.length > 0 && (\n                <section className="content-photo-publication-set" aria-label="Карусель">\n                  <div className="content-photo-publication-set__title">Карусель · {publicationSets.carousel.length}</div>\n                  <div className="content-photo-selection">\n                    {photoButton(publicationSets.carousel[0], 'content-photo-hero')}\n                    {publicationSets.carousel.length > 1 && (\n                      <div className="content-photo-grid">\n                        {publicationSets.carousel.slice(1).map((photo) => photoButton(photo, 'content-photo-tile'))}\n                      </div>\n                    )}\n                  </div>\n                </section>\n              )}\n              {publicationSets.stories.length > 0 && (\n                <section className="content-photo-publication-set" aria-label="Сториз">\n                  <div className="content-photo-publication-set__title">Сториз · {publicationSets.stories.length}</div>\n                  <div className="content-photo-selection">\n                    {photoButton(publicationSets.stories[0], 'content-photo-hero')}\n                    {publicationSets.stories.length > 1 && (\n                      <div className="content-photo-grid">\n                        {publicationSets.stories.slice(1).map((photo) => photoButton(photo, 'content-photo-tile'))}\n                      </div>\n                    )}\n                  </div>\n                </section>\n              )}\n            </div>\n          )}`,
  'gallery output',
);

component = replaceOrThrow(
  component,
  `  const contentSharePhotos = (entry: ContentEntry): ContentSharePhoto[] =>\n    resolveContentPhotoSelection({\n      photos: entry.photos,\n      photoIds: entry.photoIds,\n      contentDraft: entry.contentDraft,\n    }).map((photo) => ({ src: photo.src, originalIndex: photo.originalIndex }));`,
  `  const contentPublicationSets = (entry: ContentEntry) =>\n    resolveContentPhotoPublicationSets({\n      photos: entry.photos,\n      photoIds: entry.photoIds,\n      contentDraft: entry.contentDraft,\n    });\n\n  const contentSharePhotos = (\n    entry: ContentEntry,\n    target: 'carousel' | 'stories',\n  ): ContentSharePhoto[] =>\n    contentPublicationSets(entry)[target].map((photo) => ({\n      src: photo.src,\n      originalIndex: photo.originalIndex,\n    }));`,
  'share photo resolver',
);

component = replaceOrThrow(
  component,
  `  const shareContentToInstagram = async (entry: ContentEntry) => {\n    setShareMenuEntryId(null);\n    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;\n    const preparation = prepareInstagramContentShare({\n      entryId: currentEntry.id,\n      savedText: currentEntry.textDraft,\n      photos: contentSharePhotos(currentEntry),\n    });\n\n    if (preparation.status === 'no_photo') {\n      setShareFeedbackByEntry((current) => ({\n        ...current,\n        [entry.id]: { kind: 'error', message: 'Для Instagram нужна фотография из итоговой подборки' },\n      }));`,
  `  const shareContentToInstagram = async (\n    entry: ContentEntry,\n    target: 'carousel' | 'stories',\n  ) => {\n    setShareMenuEntryId(null);\n    const currentEntry = contentEntriesRef.current.find((candidate) => candidate.id === entry.id) ?? entry;\n    const preparation = prepareInstagramContentShare({\n      entryId: currentEntry.id,\n      savedText: currentEntry.textDraft,\n      photos: contentSharePhotos(currentEntry, target),\n    });\n\n    if (preparation.status === 'no_photo') {\n      const targetLabel = target === 'carousel' ? 'карусели' : 'сториз';\n      setShareFeedbackByEntry((current) => ({\n        ...current,\n        [entry.id]: { kind: 'error', message: 'В подборке для ' + targetLabel + ' нет фотографий' },\n      }));`,
  'targeted Instagram share',
);

component = replaceOrThrow(
  component,
  `              {shareMenuEntryId === entry.id && (\n                <ContentShareSheet\n                  onInstagram={() => void shareContentToInstagram(entry)}\n                  onOtherApps={() => void shareContentToOtherApps(entry)}\n                  onClose={() => setShareMenuEntryId(null)}\n                />\n              )}`,
  `              {shareMenuEntryId === entry.id && (\n                <ContentShareSheet\n                  carouselCount={contentPublicationSets(entry).carousel.length}\n                  storiesCount={contentPublicationSets(entry).stories.length}\n                  onInstagramCarousel={() => void shareContentToInstagram(entry, 'carousel')}\n                  onInstagramStories={() => void shareContentToInstagram(entry, 'stories')}\n                  onOtherApps={() => void shareContentToOtherApps(entry)}\n                  onClose={() => setShareMenuEntryId(null)}\n                />\n              )}`,
  'share sheet usage',
);

writeFileSync(componentPath, component);

const cssPath = 'src/index.css';
let css = readFileSync(cssPath, 'utf8');

css = replaceOrThrow(
  css,
  `.content-share-sheet button:active {\n  background: rgba(var(--gold-rgb), 0.17);\n}\n`,
  `.content-share-sheet button:active:not(:disabled) {\n  background: rgba(var(--gold-rgb), 0.17);\n}\n\n.content-share-sheet button:disabled {\n  opacity: 0.42;\n  cursor: default;\n}\n`,
  'share disabled state',
);

css = replaceOrThrow(
  css,
  `.content-photo-selection {\n  display: grid;\n  gap: 8px;\n}\n`,
  `.content-photo-publication-sets {\n  display: grid;\n  gap: 16px;\n}\n\n.content-photo-publication-set {\n  display: grid;\n  gap: 8px;\n}\n\n.content-photo-publication-set__title {\n  color: var(--text-soft);\n  font-size: 12px;\n  letter-spacing: 0.4px;\n}\n\n.content-photo-selection {\n  display: grid;\n  gap: 8px;\n}\n`,
  'publication set styles',
);

writeFileSync(cssPath, css);
console.log('Applied ContentINKA publication UI patch.');
