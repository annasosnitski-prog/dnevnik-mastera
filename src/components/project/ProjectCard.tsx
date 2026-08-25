import { DROP_CAP_FONT } from '../InkaLogo';
import { type Project, PROJECT_CATEGORIES, PROJECT_STATUSES } from '../../domain/project';
import { isRTL, firstLetter, nameRest } from '../../lib/textFormat';
import { COLORS, fs } from '../ui/designTokens';

// Project cover card intentionally has no per-project colour marker. Client
// colour remains a client-level visual identifier; projects use the shared
// neutral/gold design system instead.
export function ProjectCard({
  project,
  clientName,
  onClick,
}: {
  project: Project;
  clientName: string | null;
  onClick: () => void;
}) {
  return (
    <div
      className="inka-card"
      onClick={onClick}
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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexShrink: 0, direction: isRTL(project.title) ? 'rtl' : 'ltr' }}>
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
            {firstLetter(project.title)}
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
              {nameRest(project.title)}
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(to right, rgba(var(--gold-rgb),0.42), transparent)', margin: '7px 0' }} />

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {project.generalNotes ? (
            <div
              dir="auto"
              style={{
                fontSize: fs(15),
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {project.generalNotes}
            </div>
          ) : (
            <div style={{ fontSize: fs(15), color: COLORS.textTrace, fontStyle: 'italic' }}>Без заметок</div>
          )}
        </div>

        <div style={{ marginBottom: 6, minWidth: 0 }}>
          <div style={{ fontSize: fs(9.5), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Тип</div>
          <div
            style={{
              fontSize: fs(12),
              color: COLORS.textSecondary,
              fontStyle: 'italic',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {PROJECT_CATEGORIES.find((c) => c.key === project.category)?.label ?? 'Другое'}
          </div>
        </div>

        {/* Обложка несёт ровно две метки — см. §10: клиент видит статус,
            КРОМЕ статуса 'active', где вместо него транслируется next step
            (тот же next step, что и на шкале таймлайна). Пустой next step
            на активном проекте — тоже статус, а не пустая обложка. */}
        {project.status === 'active' && project.nextActionText ? (
          <div style={{ marginBottom: 6, minWidth: 0 }}>
            <div style={{ fontSize: fs(9.5), color: COLORS.textGhost, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Следующий шаг</div>
            <div
              style={{
                fontSize: fs(12),
                color: COLORS.textSecondary,
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {project.nextActionText}
              {project.nextActionDate ? ` · ${project.nextActionDate}` : ''}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <span
              style={{
                fontSize: fs(10.5),
                color: COLORS.textFaint,
                border: '0.5px solid rgba(var(--gold-rgb),0.3)',
                padding: '2px 7px',
                borderRadius: 1,
                letterSpacing: '0.5px',
              }}
            >
              {PROJECT_STATUSES.find((s) => s.key === project.status)?.label ?? project.status}
            </span>
          </div>
        )}

        {clientName && (
          <div style={{ marginBottom: 6, minWidth: 0 }}>
            <span style={{ fontSize: fs(11), color: COLORS.textSecondary, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {clientName}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {project.style ? (
            <span
              style={{
                fontSize: fs(11),
                color: COLORS.textFaint,
                border: '0.5px solid rgba(var(--gold-rgb),0.3)',
                padding: '2px 7px',
                borderRadius: 1,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
            >
              {project.style}
            </span>
          ) : (
            <span style={{ fontSize: fs(11), color: COLORS.textGhost, fontStyle: 'italic', letterSpacing: '0.5px' }}>—</span>
          )}
        </div>
      </div>
    </div>
  );
}
