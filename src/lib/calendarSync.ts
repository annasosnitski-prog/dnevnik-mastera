// ============================================================
// ДНЕВНИК МАСТЕРА — синхронизация записей с Инка-календарём
// (ШАГ 2 моста Дневник → Google Calendar → бот)
//
// Когда мастер сохраняет клиента (единственная воронка всех изменений —
// saveClient в TattoDiary.tsx), мы сравниваем старую и новую карточку и
// шлём в «дверцу» бота (/api/diary-sync на стороне Inka-Bot) только то,
// что реально поменялось: новые/изменённые сессии и консультации —
// upsert, удалённые — delete. Бот кладёт их в тот же Google Calendar,
// который читает «что на неделе».
//
// БЕЗОПАСНОСТЬ:
//  • Функция включается ТОЛЬКО когда введён секрет — сам по себе
//    переключатель без секрета ничего не делает (бот ответит 401).
//    Секрет знает только мастер; другие пользователи того же приложения
//    писать в чужой календарь не могут.
//  • Секрет живёт в ОТДЕЛЬНОМ ключе localStorage ('inka-calendar-sync'),
//    а резервная копия (Настройки → Экспорт) выгружает только clients —
//    секрет в бэкап не попадает и не переедет на чужое устройство.
//
// Синхронизация fire-and-forget: никогда не блокирует UI и не ломает
// сохранение — сбой сети просто логируется в консоль.
// ============================================================

// Структурные мини-типы: только поля, которые нужны синхронизации.
// Полные интерфейсы живут в TattoDiary.tsx и не экспортируются —
// структурная типизация TS позволяет не трогать большой файл.
export interface SyncSession {
  id: string;
  date: string;
  time: string;
  duration: string;
  area: string;
  style: string;
}
export interface SyncConsultation {
  id: string;
  date: string;
  time: string;
  area: string;
  style: string;
}
export interface SyncClient {
  id: string;
  name: string;
  surname: string;
  sessions: SyncSession[];
  consultations: SyncConsultation[];
}

// ----------------------------------------------------------
// НАСТРОЙКИ (localStorage, отдельный от бэкапа ключ)
// ----------------------------------------------------------

export interface CalendarSyncSettings {
  enabled: boolean;
  endpoint: string; // URL «дверцы» бота
  secret: string; // общий секрет (DIARY_SYNC_SECRET на стороне бота)
}

const STORAGE_KEY = 'inka-calendar-sync';
export const DEFAULT_ENDPOINT = 'https://inka-kappa.vercel.app/api/diary-sync';

export function readSyncSettings(): CalendarSyncSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        enabled: p.enabled === true,
        endpoint: typeof p.endpoint === 'string' && p.endpoint.trim() ? p.endpoint : DEFAULT_ENDPOINT,
        secret: typeof p.secret === 'string' ? p.secret : '',
      };
    }
  } catch {
    /* ignore */
  }
  return { enabled: false, endpoint: DEFAULT_ENDPOINT, secret: '' };
}

export function writeSyncSettings(s: CalendarSyncSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// Секрет — настоящий выключатель: без него синхронизация выключена
// наглухо, что бы ни показывал переключатель.
export function syncActive(s: CalendarSyncSettings): boolean {
  return s.enabled && !!s.secret.trim() && !!s.endpoint.trim();
}

// ----------------------------------------------------------
// ПОМОЩНИКИ
// ----------------------------------------------------------

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^\d{2}:\d{2}$/;

// Запись можно синхронизировать, только если дата ISO и время задано —
// у старых записей дата могла быть свободным текстом («в июле»), их
// в календарь не положить.
function syncable(e: { date: string; time: string }): boolean {
  return YMD.test(e.date) && HM.test(e.time);
}

// «4 ч» / «2.5 ч» / «90 мин» → минуты. Не распарсилось — дефолт по типу.
export function parseDurationMin(raw: string, fallback: number): number {
  const m = (raw ?? '').replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!m) return fallback;
  const n = parseFloat(m[1]);
  if (!isFinite(n) || n <= 0) return fallback;
  if (/мин|min/i.test(raw)) return Math.round(n);
  return Math.round(n * 60); // по умолчанию считаем часами
}

function clientLabel(c: SyncClient): string {
  return [c.name, c.surname].filter(Boolean).join(' ').trim() || 'клиент';
}

function sessionDescriptor(s: SyncSession): string {
  return [s.area, s.style].filter((x) => x && x.trim()).join(' · ');
}
function consultationDescriptor(c: SyncConsultation): string {
  return [c.area, c.style].filter((x) => x && x.trim()).join(' · ');
}

// Стабильный id записи для бота — по нему бот детерминированно строит
// id события Google, поэтому повтор апдейтит то же событие, а не дублит.
function diaryId(clientId: string, kind: 's' | 'c', entryId: string): string {
  return `${clientId}:${kind}:${entryId}`;
}

// Поля, изменение которых требует пере-синхронизации (пузырьки заметок,
// фото и т.п. в календарь не идут — их изменения не должны дёргать сеть).
function sessionSyncKey(s: SyncSession): string {
  return [s.date, s.time, s.duration, s.area, s.style].join('|');
}
function consultationSyncKey(c: SyncConsultation): string {
  return [c.date, c.time, c.area, c.style].join('|');
}

// ----------------------------------------------------------
// ОТПРАВКА (fire-and-forget)
// ----------------------------------------------------------

type SyncPayload =
  | {
      action: 'upsert';
      diaryId: string;
      type: 'tattoo' | 'consultation';
      date: string;
      time: string;
      durationMin: number;
      clientName: string;
      descriptor: string;
    }
  | { action: 'delete'; diaryId: string };

function send(settings: CalendarSyncSettings, payload: SyncPayload): void {
  fetch(settings.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.secret}`,
    },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      if (!res.ok) {
        console.warn('inka-sync: отказ сервера', res.status, await res.text().catch(() => ''));
      }
    })
    .catch((err) => {
      console.warn('inka-sync: сеть недоступна, запись не синхронизирована', err);
    });
}

// ----------------------------------------------------------
// ГЛАВНАЯ ФУНКЦИЯ — дифф старой и новой карточки клиента
// oldClient = null → клиент создан; newClient = null → клиент удалён.
// ----------------------------------------------------------

export function diffAndSync(
  oldClient: SyncClient | null,
  newClient: SyncClient | null,
  settings: CalendarSyncSettings = readSyncSettings()
): void {
  if (!syncActive(settings)) return;
  const ref = newClient ?? oldClient;
  if (!ref) return;
  const clientId = ref.id;
  const label = clientLabel(ref);

  const oldSessions = new Map((oldClient?.sessions ?? []).map((s) => [s.id, s]));
  const newSessions = new Map((newClient?.sessions ?? []).map((s) => [s.id, s]));
  const oldConsults = new Map((oldClient?.consultations ?? []).map((c) => [c.id, c]));
  const newConsults = new Map((newClient?.consultations ?? []).map((c) => [c.id, c]));

  // Сессии: новые/изменённые → upsert; пропавшие → delete.
  for (const [id, s] of newSessions) {
    if (!syncable(s)) continue;
    const prev = oldSessions.get(id);
    if (prev && sessionSyncKey(prev) === sessionSyncKey(s)) continue; // не менялось — не шлём
    send(settings, {
      action: 'upsert',
      diaryId: diaryId(clientId, 's', id),
      type: 'tattoo',
      date: s.date,
      time: s.time,
      durationMin: parseDurationMin(s.duration, 120),
      clientName: label,
      descriptor: sessionDescriptor(s),
    });
  }
  for (const [id, prev] of oldSessions) {
    if (newSessions.has(id)) continue;
    if (!syncable(prev)) continue; // несинхронизируемая и не была в календаре
    send(settings, { action: 'delete', diaryId: diaryId(clientId, 's', id) });
  }

  // Консультации: та же логика.
  for (const [id, c] of newConsults) {
    if (!syncable(c)) continue;
    const prev = oldConsults.get(id);
    if (prev && consultationSyncKey(prev) === consultationSyncKey(c)) continue;
    send(settings, {
      action: 'upsert',
      diaryId: diaryId(clientId, 'c', id),
      type: 'consultation',
      date: c.date,
      time: c.time,
      durationMin: 30,
      clientName: label,
      descriptor: consultationDescriptor(c),
    });
  }
  for (const [id, prev] of oldConsults) {
    if (newConsults.has(id)) continue;
    if (!syncable(prev)) continue;
    send(settings, { action: 'delete', diaryId: diaryId(clientId, 'c', id) });
  }
}
