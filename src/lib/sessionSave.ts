// Форма сессии: её поля и приведение к записи.
//
// Сами мутации живут в lib/projectRecordSave.ts — после Этапа 2 сессия
// хранится только в своём проекте, поэтому прежние client-формы
// (upsertClientSession/applyConsultationConversion/applyConsultationRestoration)
// и отдельная project-форма (upsertProjectSession) удалены: они писали в
// хранилище, которое приложение больше не читает, и оставлять их значило бы
// держать под рукой второй, молча ломающий данные способ сохранить запись.

export interface SessionFormData {
  name: string;
  date: string;
  time: string;
  duration: string;
  style: string;
  area: string;
  colors: string;
  needles: string;
  skinReaction: string;
  note: string;
  photos: string[];
  done: boolean;
  // «Это последняя сессия проекта?» — см. Session.isLastSession. Формой
  // спрашивается только у выполненной сессии проекта, где это не выведено из
  // sessionsPlan (см. NewSessionSheet).
  //
  // Прежнего `healed` здесь больше нет: флаг deprecated (см. Session.healed),
  // убран из UI, и форма не должна его перезаписывать — старое значение
  // остаётся на записи нетронутым, а нормализация переносит его как есть.
  isLastSession: boolean;
  projectId: string | null;
}

export function sessionFields(data: SessionFormData) {
  return {
    name: data.name.trim(),
    date: data.date,
    time: data.time,
    duration: data.duration,
    style: data.style,
    area: data.area.trim(),
    colors: data.colors.trim(),
    needles: data.needles.trim(),
    skinReaction: data.skinReaction.trim(),
    note: data.note.trim(),
    photos: data.photos,
    done: data.done,
    // Не последняя, пока сессия не выполнена: незавершённая встреча ничего
    // не закрывает, а держать «да» на будущей сессии значило бы запустить
    // цикл заживления по дате, которой ещё не было.
    isLastSession: data.done && data.isLastSession,
    projectId: data.projectId,
  };
}
