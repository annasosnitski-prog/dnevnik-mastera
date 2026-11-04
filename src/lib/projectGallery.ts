// «Все фото проекта» — одна галерея из всех снимков, разбросанных по
// записям проекта: консультации, сессии (и их контрольные фото
// заживления), заметки/задачи, привязанные к проекту, собственные фото
// проекта и галерея заживления. Мудборд сюда не входит — это отдельная,
// уже отобранная подборка со своим порядком и ссылками, она показана
// рядом своей секцией.
//
// Чистая функция без React — только собирает и подписывает, ничего не
// пишет. Порядок — хронология проекта: консультации → сессии → заметки →
// фото проекта → заживление. Один и тот же снимок (например, референс
// консультации, переехавший в сессию при «Перевести в сессию») попадает
// в галерею один раз — по первому месту, где он встретился.
import type { Project } from '../domain/project';
import type { Client } from '../domain/client';
import type { ClientNote } from '../domain/task';
import { getConsultationSequence, getSessionsByProjectId } from '../domain/projectSelectors.js';
import { getTasksByProjectId } from '../domain/taskSelectors.js';

export type ProjectPhotoSourceKind = 'consultation' | 'session' | 'sessionHealing' | 'note' | 'project' | 'healing';

export interface ProjectPhoto {
  src: string;
  kind: ProjectPhotoSourceKind;
  // Короткая подпись источника для плитки: «Конс. 1», «Сессия 2», ...
  label: string;
  date: string;
}

export function collectProjectPhotos(project: Project, linkedClient: Client | null, masterNotes: ClientNote[] = []): ProjectPhoto[] {
  const out: ProjectPhoto[] = [];
  const seen = new Set<string>();
  const push = (src: string, kind: ProjectPhotoSourceKind, label: string, date: string) => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    out.push({ src, kind, label, date });
  };

  const consultations = linkedClient ? getConsultationSequence(linkedClient.consultations, project.id) : getConsultationSequence(project.consultations, project.id);
  const sessions = (linkedClient ? getSessionsByProjectId(linkedClient.sessions, project.id) : project.sessions)
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const notes = linkedClient ? getTasksByProjectId(linkedClient.notes, project.id) : getTasksByProjectId(masterNotes, project.id);

  consultations.forEach((c, i) => c.photos.forEach((src) => push(src, 'consultation', `Конс. ${i + 1}`, c.date)));
  sessions.forEach((s, i) => {
    s.photos.forEach((src) => push(src, 'session', `Сессия ${i + 1}`, s.date));
    (s.healingCheckPhotos ?? []).forEach((p) => push(p.url, 'sessionHealing', `Сессия ${i + 1} · заживл.`, p.addedDate));
  });
  notes.forEach((n) => (n.photos ?? []).forEach((src) => push(src, 'note', 'Заметка', (n.createdDate || '').slice(0, 10))));
  project.photos.forEach((src) => push(src, 'project', 'Проект', (project.createdDate || '').slice(0, 10)));
  project.healingPhotos.forEach((p) => push(p.url, 'healing', 'Заживление', p.addedDate));

  return out;
}

const IMAGE_EXTENSIONS: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', heic: 'heic' };

// data URL → File для системного «Поделиться». null — не data URL (внешняя
// ссылка) или битый base64: такой снимок просто не уходит, а не роняет всю
// отправку.
export function projectPhotoToFile(src: string, projectId: string, index: number): File | null {
  const match = /^data:image\/([a-z]+);base64,([a-z0-9+/=\s]+)$/i.exec(src);
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const type = match[1].toLowerCase();
    const ext = IMAGE_EXTENSIONS[type] ?? type;
    return new File([bytes.buffer as ArrayBuffer], `project-${projectId}-${index + 1}.${ext}`, { type: `image/${type}` });
  } catch {
    return null;
  }
}

// 'shared' — ушло через системное меню; 'downloaded' — платформа не умеет
// делиться файлами, снимки сохранены скачиванием по одному; 'cancelled' —
// мастер закрыла окно «Поделиться».
export type ProjectPhotoShareResult = 'shared' | 'downloaded' | 'cancelled';

export async function shareProjectPhotos(srcs: string[], projectId: string): Promise<ProjectPhotoShareResult> {
  const files = srcs.map((src, i) => projectPhotoToFile(src, projectId, i)).filter((f): f is File => f !== null);
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (files.length > 0 && nav.share && nav.canShare && nav.canShare({ files })) {
    try {
      await nav.share({ files });
      return 'shared';
    } catch (err) {
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') return 'cancelled';
    }
  }
  srcs.forEach((src, i) => {
    const file = projectPhotoToFile(src, projectId, i);
    const link = document.createElement('a');
    link.href = src;
    link.download = file?.name ?? `project-${projectId}-${i + 1}.jpg`;
    link.click();
  });
  return 'downloaded';
}

// ── «Все заметки проекта» ── тексты из всех записей проекта одним списком:
// общие заметки консультаций (и их итог/чувство/креатив/источники), заметки
// и реакция кожи сессий, заметки/задачи, привязанные к проекту, и общие
// заметки самого проекта. Пустые поля пропускаются; порядок — та же
// хронология, что у фото.
export type ProjectNoteSourceKind = 'project' | 'consultation' | 'session' | 'note';

export interface ProjectNoteItem {
  key: string;
  kind: ProjectNoteSourceKind;
  label: string;
  date: string;
  text: string;
  done?: boolean;
}

function joinParts(parts: Array<[string, string | undefined]>): string {
  return parts
    .map(([title, value]) => [title, (value ?? '').trim()] as const)
    .filter(([, value]) => value.length > 0)
    .map(([title, value]) => (title ? `${title}: ${value}` : value))
    .join('\n\n');
}

export function collectProjectNotes(project: Project, linkedClient: Client | null, masterNotes: ClientNote[] = []): ProjectNoteItem[] {
  const out: ProjectNoteItem[] = [];
  const consultations = linkedClient ? getConsultationSequence(linkedClient.consultations, project.id) : getConsultationSequence(project.consultations, project.id);
  const sessions = (linkedClient ? getSessionsByProjectId(linkedClient.sessions, project.id) : project.sessions)
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const notes = linkedClient ? getTasksByProjectId(linkedClient.notes, project.id) : getTasksByProjectId(masterNotes, project.id);

  const projectText = joinParts([['', project.generalNotes]]);
  if (projectText) out.push({ key: `p-${project.id}`, kind: 'project', label: 'Проект', date: (project.createdDate || '').slice(0, 10), text: projectText });

  consultations.forEach((c, i) => {
    const text = joinParts([
      ['', c.generalNotes],
      ['Итог', c.outcome],
      ['Чувство', c.feeling],
      ['Креатив', c.creative],
      ['Источники', c.inspirationSources],
    ]);
    if (text) out.push({ key: `c-${c.id}`, kind: 'consultation', label: `Консультация ${i + 1}`, date: c.date, text });
  });
  sessions.forEach((s, i) => {
    const text = joinParts([
      ['', s.note],
      ['Кожа', s.skinReaction],
    ]);
    if (text) out.push({ key: `s-${s.id}`, kind: 'session', label: `Сессия ${i + 1}`, date: s.date, text });
  });
  notes.forEach((n) => {
    const text = (n.text || '').trim();
    if (text) out.push({ key: `n-${n.id}`, kind: 'note', label: 'Заметка', date: (n.createdDate || '').slice(0, 10), text, done: n.done });
  });
  return out;
}
