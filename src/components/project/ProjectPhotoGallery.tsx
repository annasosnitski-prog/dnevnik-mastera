import { useState } from 'react';
import { type ProjectPhoto, shareProjectPhotos } from '../../lib/projectGallery';
import { COLORS, fs } from '../TattoDiary';

// «Все фото проекта» в окне проекта — плитка из всех снимков записей
// проекта (см. collectProjectPhotos). Обычный тап — увеличить; режим
// выбора включается кнопкой «Выбрать», в нём тап отмечает плитку, есть
// «Выбрать все», а отмеченные уходят через системное «Поделиться» (или
// скачиваются, если платформа не умеет делиться файлами). Выход из выбора
// — красный крестик, отправка — зелёная галочка (как сохранение везде).
export function ProjectPhotoGallery({ photos, projectId }: { photos: ProjectPhoto[]; projectId: string }) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const allSelected = photos.length > 0 && selected.size === photos.length;
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (src: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };
  const handleShare = async () => {
    if (selected.size === 0 || sharing) return;
    setSharing(true);
    setNote(null);
    try {
      const srcs = photos.filter((p) => selected.has(p.src)).map((p) => p.src);
      const result = await shareProjectPhotos(srcs, projectId);
      if (result === 'cancelled') return;
      setNote(result === 'downloaded' ? `Сохранено фото: ${srcs.length}` : null);
      exitSelect();
    } finally {
      setSharing(false);
    }
  };

  const linkStyle: React.CSSProperties = { fontSize: fs(11), color: COLORS.gold, cursor: 'pointer', letterSpacing: '0.5px', textTransform: 'none' };

  return (
    <div>
      <div style={{ fontSize: fs(10), color: COLORS.textGhost, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 20 }}>
        <span>Все фото проекта{photos.length > 0 ? ` · ${photos.length}` : ''}</span>
        {photos.length > 0 && (selecting ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span onClick={() => setSelected(allSelected ? new Set() : new Set(photos.map((p) => p.src)))} style={linkStyle}>
              {allSelected ? 'Снять все' : 'Выбрать все'}
            </span>
            <span role="button" aria-label="Отменить выбор" title="Отменить выбор" onClick={exitSelect} style={{ cursor: 'pointer', color: '#A85A66', display: 'inline-flex' }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </span>
            <span
              role="button"
              aria-label="Поделиться выбранными"
              title="Поделиться выбранными"
              onClick={handleShare}
              style={{ cursor: selected.size > 0 && !sharing ? 'pointer' : 'default', opacity: selected.size > 0 && !sharing ? 1 : 0.35, display: 'inline-flex' }}
            >
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                <path d="M2.5 8.3L6 11.8L13.5 4.3" stroke="#5E8C4A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
        ) : (
          <span onClick={() => { setSelecting(true); setNote(null); }} style={linkStyle}>Выбрать</span>
        ))}
      </div>

      {photos.length === 0 ? (
        <div style={{ fontSize: fs(12), color: COLORS.textGhost, fontStyle: 'italic' }}>В записях проекта пока нет фото</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {photos.map((p, i) => {
            const isSelected = selected.has(p.src);
            return (
              <div
                key={`${p.kind}-${i}`}
                onClick={() => (selecting ? toggle(p.src) : setViewerSrc(p.src))}
                style={{ position: 'relative', width: '100%', aspectRatio: '1', cursor: 'pointer' }}
              >
                <img
                  src={p.src}
                  alt=""
                  draggable={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: 2,
                    display: 'block',
                    border: isSelected ? `2px solid ${COLORS.gold}` : '1px solid rgba(var(--gold-rgb),0.2)',
                    opacity: selecting && !isSelected ? 0.6 : 1,
                  }}
                />
                <span style={{ position: 'absolute', left: 3, bottom: 3, right: 3, fontSize: fs(8.5), color: '#EDE4CC', background: 'rgba(0,0,0,0.5)', borderRadius: 2, padding: '1px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.3px' }}>
                  {p.label}
                </span>
                {selecting && (
                  <span style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%', border: '1.5px solid #EDE4CC', background: isSelected ? '#5E8C4A' : 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                        <path d="M2.5 8.3L6 11.8L13.5 4.3" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selecting && (
        <div style={{ fontSize: fs(11), color: COLORS.textGhost, marginTop: 6 }}>
          {sharing ? 'Отправка…' : selected.size > 0 ? `Выбрано: ${selected.size} — галочка, чтобы поделиться` : 'Отметьте фото'}
        </div>
      )}
      {note && <div style={{ fontSize: fs(11), color: COLORS.textGhost, marginTop: 6 }}>{note}</div>}

      {viewerSrc && (
        <div onClick={() => setViewerSrc(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <img src={viewerSrc} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 2 }} />
        </div>
      )}
    </div>
  );
}
