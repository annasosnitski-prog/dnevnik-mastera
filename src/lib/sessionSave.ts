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
  healed: boolean;
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
    healed: data.healed,
    projectId: data.projectId,
  };
}
