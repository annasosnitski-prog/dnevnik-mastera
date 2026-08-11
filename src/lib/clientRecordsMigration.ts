// ============================================================
// ЭТАП 2 — перенос сессий и консультаций клиента на проект
//
// Иерархия становится Клиент → Проект → консультации/сессии: записи живут
// ТОЛЬКО в Project.sessions/Project.consultations, а «записи клиента» —
// вычисляемое объединение по его проектам (см. getClientSessions/
// getClientConsultations в domain/projectSelectors.ts). До этого этапа одни
// и те же по смыслу записи лежали в двух местах — Client.sessions/
// consultations для клиентских и Project.* для «Мастерской», — и именно
// отсюда брались расхождения между карточкой клиента и проектом.
//
// БЕЗОПАСНОСТЬ (данные у мастера живут только в браузере, сервера и
// автобэкапа нет):
//  • Функция ЧИСТАЯ — ничего не пишет сама, только считает новый список
//    проектов; запись делает вызывающий код одним обычным saveProject.
//  • Легаси-массивы Client.sessions/consultations НЕ трогаются и остаются
//    в базе как страховка: если перенос куда-то положил запись неверно,
//    исходник цел и его видно в бэкапе. Приложение их просто больше не
//    читает.
//  • Идемпотентность обязательна именно потому, что легаси-массивы
//    остаются: миграция прогоняется при каждой загрузке, и запись, уже
//    перенесённую в прошлый раз, нельзя перенести повторно. Признак «уже
//    перенесена» — совпадение id с записью в любом проекте этого клиента.
//
// Куда попадает запись:
//  1. В проект из её собственного projectId — если такой проект существует
//     и принадлежит этому же клиенту (обычный случай после Этапа 1, где
//     projectId проставляется всегда).
//  2. Иначе — в «Неразобранный проект» этого клиента (projectId пустой,
//     или указывает на удалённый проект, или на проект чужого клиента —
//     во всех трёх случаях однозначно определить проект нельзя, а терять
//     запись нельзя тем более).
// ============================================================
import type { Client } from '../domain/client';
import type { Project } from '../domain/project';
import { makeBucketProject } from './autoProject.js';

export const UNSORTED_PROJECT_TITLE = 'Неразобранный проект';

// Детерминированный id — «Неразобранный» у клиента ровно один, повторный
// прогон миграции не плодит новые.
export function unsortedProjectId(clientId: string): string {
  return `unsorted-${clientId}`;
}

export interface ClientRecordsMigrationResult {
  // Новый список проектов; если переносить было нечего — та же ссылка, что
  // и на входе (вызывающий код по этому признаку понимает, что писать в
  // базу нечего).
  projects: Project[];
  movedSessions: number;
  movedConsultations: number;
  // Сколько «Неразобранных» проектов пришлось завести.
  createdUnsortedProjects: number;
  // id проектов, которые реально изменились — чтобы сохранить только их,
  // а не переписывать весь стор.
  changedProjectIds: string[];
}

export function migrateClientRecordsIntoProjects(clients: Client[], projects: Project[]): ClientRecordsMigrationResult {
  // Рабочие копии — исходные объекты не мутируются (правило доменного слоя).
  const byId = new Map<string, Project>(projects.map((p) => [p.id, p]));
  const changed = new Set<string>();
  let movedSessions = 0;
  let movedConsultations = 0;
  let createdUnsortedProjects = 0;

  // Уже перенесённые id — по всем проектам клиента сразу, а не только по
  // целевому: запись могли перенести в «Неразобранный», а потом мастер
  // руками перекинула её в настоящий проект. Второй прогон не должен
  // вернуть её обратно.
  const clientRecordIds = (clientId: string): { sessions: Set<string>; consultations: Set<string> } => {
    const sessions = new Set<string>();
    const consultations = new Set<string>();
    for (const p of byId.values()) {
      if (p.clientId !== clientId) continue;
      for (const s of p.sessions) sessions.add(s.id);
      for (const c of p.consultations) consultations.add(c.id);
    }
    return { sessions, consultations };
  };

  for (const client of clients) {
    if (client.sessions.length === 0 && client.consultations.length === 0) continue;
    const seen = clientRecordIds(client.id);

    // «Неразобранный» заводится лениво — только если реально есть что в него
    // положить, чтобы не плодить пустые проекты у всех клиентов подряд.
    // Всегда читаем из byId (а не из локальной переменной): проекты ниже
    // пересобираются копией на каждую запись, и закешированная ссылка
    // устарела бы уже после первой.
    const ensureUnsorted = (): Project => {
      const id = unsortedProjectId(client.id);
      const existing = byId.get(id);
      if (existing) return existing;
      const created = makeBucketProject(id, UNSORTED_PROJECT_TITLE, client.color, client.id);
      byId.set(id, created);
      createdUnsortedProjects += 1;
      return created;
    };

    // Целевой проект записи: её собственный projectId, если он ведёт на
    // существующий проект ЭТОГО клиента; иначе — «Неразобранный».
    const targetFor = (projectId: string | null): Project => {
      if (projectId) {
        const linked = byId.get(projectId);
        if (linked && linked.clientId === client.id) return linked;
      }
      return ensureUnsorted();
    };

    for (const session of client.sessions) {
      if (seen.sessions.has(session.id)) continue; // уже перенесена
      const target = targetFor(session.projectId);
      byId.set(target.id, { ...target, sessions: [...target.sessions, { ...session, projectId: target.id }] });
      seen.sessions.add(session.id);
      changed.add(target.id);
      movedSessions += 1;
    }

    for (const consultation of client.consultations) {
      if (seen.consultations.has(consultation.id)) continue; // уже перенесена
      const target = targetFor(consultation.projectId);
      byId.set(target.id, {
        ...target,
        consultations: [...target.consultations, { ...consultation, projectId: target.id }],
      });
      seen.consultations.add(consultation.id);
      changed.add(target.id);
      movedConsultations += 1;
    }
  }

  if (changed.size === 0) {
    return { projects, movedSessions: 0, movedConsultations: 0, createdUnsortedProjects: 0, changedProjectIds: [] };
  }

  // Порядок: сначала прежние проекты в исходном порядке, затем новые
  // «Неразобранные» — так уже существующий порядок на экранах не скачет.
  const originalOrder = projects.map((p) => byId.get(p.id) ?? p);
  const originalIds = new Set(projects.map((p) => p.id));
  const added = [...byId.values()].filter((p) => !originalIds.has(p.id));

  return {
    projects: [...originalOrder, ...added],
    movedSessions,
    movedConsultations,
    createdUnsortedProjects,
    changedProjectIds: [...changed],
  };
}
