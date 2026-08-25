// Чистая логика для «сессия/консультация не может быть без проекта»: если
// мастер не выбрала существующий проект при создании, ей молча заводится
// один переиспользуемый проект-«отстойник» на владельца (клиента или
// мастера) — тот же id/подход, что уже даёт кнопка «Собрать старые записи в
// проекты» (bucket-<clientId>), просто без декоративного префикса «Записи ·»
// в названии для новых записей (см. migrateRecordsIntoProjects в
// TattoDiary.tsx — существующие бакеты с тем префиксом не переименовываются).
import type { Project } from '../domain/project';

// Детерминированный id — один и тот же «отстойник» переиспользуется при
// каждом повторном «не выбрала проект», а не плодится заново.
export function bucketProjectId(clientId: string | null): string {
  return clientId ? `bucket-${clientId}` : 'bucket-master';
}

// «Просто имя» — клиента, если есть, иначе мастера; без префиксов.
export function bucketProjectTitle(client: { name: string; surname: string } | null, masterName: string): string {
  if (client) return `${client.name} ${client.surname}`.trim() || 'Клиент';
  return masterName.trim() || 'Мастер';
}

// Собирает новый проект-«отстойник» — переиспользуется и миграцией старых
// данных, и ensureBucketProject ниже, чтобы не дублировать литерал
// в двух местах.
export function makeBucketProject(id: string, title: string, color: string, clientId: string | null): Project {
  const now = new Date().toISOString();
  return {
    id,
    title,
    color,
    category: 'tattoo',
    clientId,
    // Тот же дефолт, что и у любого нового проекта (см. ProjectStatus).
    status: 'active',
    // Бакет собирает разнородные записи, а не одну работу — сказать «одна
    // встреча»/«больше одной» про него нечего (см. SessionsPlan).
    sessionsPlan: null,
    state: 'active',
    waitingFor: 'none',
    nextActionText: '',
    nextActionDate: null,
    nextActionType: null,
    priority: 'normal',
    area: '',
    style: '',
    generalNotes: '',
    feeling: '',
    creative: '',
    inspirationSources: '',
    photos: [],
    healingPhotos: [],
    createdDate: now,
    lastMeaningfulActivityAt: now,
    sessions: [],
    consultations: [],
  };
}

// «Проект точно есть» — чистая часть прежнего ensureProjectId
// (TattoDiary.tsx). Возвращает список проектов, в котором нужный проект
// гарантированно присутствует, и его id.
//
// Раньше эта функция сохраняла новый бакет отдельным вызовом saveProject, а
// запись потом писалась вторым — два сохранения в одном тике, ровно та
// схема, которая теряла данные в #248. Теперь бакет возвращается вместе со
// списком и уезжает в базу тем же самым сохранением, что и сама запись.
//
// Существующий бакет (в т.ч. созданный старой миграцией, с названием
// «Записи · ФИО») переиспользуется как есть и не переименовывается.
export function ensureBucketProject(
  projects: Project[],
  projectId: string | null,
  ownerClient: { id: string; name: string; surname: string; color: string } | null,
  masterName: string,
  fallbackColor: string,
): { projects: Project[]; projectId: string } {
  if (projectId) return { projects, projectId };
  const id = bucketProjectId(ownerClient?.id ?? null);
  if (projects.some((p) => p.id === id)) return { projects, projectId: id };
  const bucket = makeBucketProject(
    id,
    bucketProjectTitle(ownerClient, masterName),
    ownerClient?.color || fallbackColor,
    ownerClient?.id ?? null,
  );
  return { projects: [...projects, bucket], projectId: id };
}
