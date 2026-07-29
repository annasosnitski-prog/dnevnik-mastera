// Обложка папки на верхнем уровне «Мастерской» — папка клиента или
// «Проекты мастера». Визуально повторяет ClientGridCard/ProjectCard (цветные
// полосы + gem-corner + drop-cap), но строится из ProjectFolder — чистого
// view-model'а (see src/domain/projectSelectors.ts), а не отдельного
// проекта. Папки не хранятся и не являются доменной сущностью.
import type { ProjectFolder } from '../../domain/projectSelectors';
import { DROP_CAP_FONT } from '../InkaLogo';
import { COLORS, fs } from '../TattoDiary';
import { TopStripe, RightStripe, GemCorner } from '../ui/Stripes';
import { isRTL, firstLetter, nameRest } from '../../lib/textFormat';

export function ProjectFolderCard({ folder, accentColor, onClick }: { folder: ProjectFolder; accentColor: string; onClick: () => void }) {
  return (
    <div
      className="inka-card"
      onClick={onClick}
      role="button"
      aria-label={`Открыть папку «${folder.title}»`}
      style={{
        position: 'relative',
        background: 'transparent',
        borderRadius: 3,
        height: 250,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <TopStripe color={accentColor} />
      <RightStripe color={accentColor} />
      <GemCorner color={accentColor} />

      <div
        style={{
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexShrink: 0, direction: isRTL(folder.title) ? 'rtl' : 'ltr' }}>
          <span
            style={{
              fontFamily: DROP_CAP_FONT,
              fontSize: fs(58),
              fontWeight: 600,
              lineHeight: 1.12,
              color: COLORS.gold,
              letterSpacing: '0px',
              flexShrink: 0,
              marginTop: -2,
            }}
          >
            {firstLetter(folder.title)}
          </span>
          <div style={{ paddingTop: 7, minWidth: 0, overflow: 'hidden' }}>
            <div
              dir="auto"
              style={{
                fontFamily: DROP_CAP_FONT,
                fontSize: fs(19),
                fontWeight: 600,
                color: COLORS.textPrimary,
                lineHeight: 1.2,
                letterSpacing: '0.3px',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {nameRest(folder.title)}
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.42), transparent)', margin: '7px 0' }} />

        <div style={{ flex: 1 }} />

        <div style={{ marginBottom: 6, minWidth: 0 }}>
          <div style={{ fontSize: fs(9.5), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Проектов</div>
          <div style={{ fontSize: fs(12), color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 2 }}>{folder.projectCount}</div>
        </div>

        {/* Визуальный признак открытия — стрелка «эта карточка открывается». */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M7 4L12 9L7 14" stroke={COLORS.gold} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
