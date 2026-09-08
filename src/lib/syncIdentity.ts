// ============================================================
// ПРИВЯЗКА ПО КОДУ — Шаг 4 синка (docs/SYNC_PLAN.md).
//
// Мастер вводит ОДИН код на каждом устройстве — без email и регистрации.
// Внутри он превращается в псевдо-почту и пароль для Supabase Auth:
// первое устройство «регистрируется» этой парой, остальные «входят» той
// же самой — код и есть общий секрет.
//
// Так у RLS в базе (см. docs/sync/schema.sql) появляется настоящий
// auth.uid(), а не самодельная проверка, которую легко забыть в одной
// политике и открыть чужие данные.
//
// Код — единственная защита, поэтому он должен быть таким же не
// угадываемым, как пароль от Wi-Fi (см. подсказку на экране привязки),
// а не «1234». Хеширование не делает слабый код сильным — оно только
// не даёт email и пароль совпадать с самим кодом дословно.
// ============================================================

const EMAIL_DOMAIN = 'sync.dnevnik-mastera.local';

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Код нечувствителен к регистру и обрамляющим пробелам — мастер вводит
// его на телефоне и на планшете, и один лишний пробел не должен превращать
// «то же устройство» в «другой дневник».
function normalizeCode(code: string): string {
  return code.trim().toLowerCase();
}

export interface SyncIdentity {
  email: string;
  password: string;
}

export async function deriveSyncIdentity(code: string): Promise<SyncIdentity> {
  const normalized = normalizeCode(code);
  const emailHash = await sha256Hex(`inka-sync-email:${normalized}`);
  const passwordHash = await sha256Hex(`inka-sync-password:${normalized}`);
  return {
    email: `d${emailHash.slice(0, 32)}@${EMAIL_DOMAIN}`,
    password: passwordHash,
  };
}

// Слабые коды не защищают синк, даже пройдя через хеш — угадать «1234»
// так же легко, как и его хеш. Порог формальный (длина), не пытается
// оценить настоящую стойкость — это подсказка мастеру, а не охрана.
export const MIN_CODE_LENGTH = 8;

export function isCodeTooWeak(code: string): boolean {
  return normalizeCode(code).length < MIN_CODE_LENGTH;
}
