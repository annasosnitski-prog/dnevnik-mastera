// ============================================================
// ХУК ПРИВЯЗКИ И ПЕРИОДИЧЕСКОГО СИНКА — Шаг 5 синка (docs/SYNC_PLAN.md).
//
// Единственное место, где дневник знает про Supabase. Экран настроек
// получает готовые значения и функции (paired/pairWithCode/syncNow/...),
// а не сам Supabase — так же, как остальной дневник получает
// onMeasureStorage вместо прямого доступа к IndexedDB.
//
// Живёт на верхнем уровне компонента (не внутри экрана настроек), потому
// что проверка «раз в час» обязана идти, пока мастер работает где угодно
// в дневнике, а не только пока открыта вкладка настроек.
//
// @supabase/supabase-js весит ощутимо (~230 кБ до сжатия) — как и
// backupArchive (139 кБ) с zip.js, ему сюда, в основной бандл, делать
// нечего. Загружается по требованию: только если устройство уже было
// привязано раньше (тогда без него дневник и не откроется офлайн-первым
// экраном) или мастер сама нажимает «Привязать»/«Синхронизировать».
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
// syncIdentity.ts не тянет Supabase (только Web Crypto) — безопасно
// импортировать сразу, не дожидаясь loadSyncModules ниже.
import { isCodeTooWeak } from '../lib/syncIdentity.js';

// Тот же ключ, что и storageKey в src/lib/supabaseClient.ts — по нему
// синхронно, без единого байта Supabase, узнаём, было ли устройство
// когда-нибудь привязано. Больше эта строка нигде не хранится нарочно:
// это внутренний формат supabase-js, знать который обязано только это
// место, принимающее решение — грузить модуль или нет.
const SUPABASE_AUTH_STORAGE_KEY = 'inka-sync-auth';

function hasStoredSession(): boolean {
  try {
    return localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

async function loadSyncModules() {
  const [{ getSupabaseClient }, { pairDeviceWithCode, unpairDevice, isPaired: checkIsPaired }, { createSupabaseRemote }, { runFullSync }] =
    await Promise.all([
      import('../lib/supabaseClient.js'),
      import('../lib/syncAuth.js'),
      import('./supabaseRemote.js'),
      import('./syncEngine.js'),
    ]);
  return { getSupabaseClient, pairDeviceWithCode, unpairDevice, checkIsPaired, createSupabaseRemote, runFullSync };
}

// Раз в час, как договорились — не реальное время (см. docs/SYNC_PLAN.md,
// «Что выбрано и почему»).
const SYNC_INTERVAL_MS = 60 * 60 * 1000;

const LAST_SYNC_KEY = 'inka-sync-last-at';

export type SyncPhase = 'checking' | 'unpaired' | 'paired' | 'syncing';

export interface SyncDriverState {
  phase: SyncPhase;
  lastSyncAt: string | null;
  lastError: string | null;
  isCodeTooWeak: (code: string) => boolean;
  pairWithCode: (code: string) => Promise<{ ok: boolean; message?: string }>;
  unpair: () => Promise<void>;
  syncNow: () => Promise<void>;
}

export function useSyncDriver(getDatabase: () => IDBDatabase | null): SyncDriverState {
  // Ни разу не привязано — сразу 'unpaired', без единого динамического
  // импорта: это обычное состояние подавляющего большинства запусков.
  const [phase, setPhase] = useState<SyncPhase>(() => (hasStoredSession() ? 'checking' : 'unpaired'));
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_SYNC_KEY);
    } catch {
      return null;
    }
  });
  const [lastError, setLastError] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // paired и syncing — два UI-состояния одной и той же привязки.
  // Для таймера это ОБА «синк включён»: если считать syncing выключением,
  // каждая синхронизация сама очистит эффект, а возврат в paired тут же
  // создаст его заново и немедленно запустит следующий синк — бесконечный цикл.
  const syncEnabled = phase === 'paired' || phase === 'syncing';

  const runSync = useCallback(async () => {
    // Одна синхронизация одновременно: ручное «Синхронизировать сейчас» и
    // часовой таймер не должны столкнуться в двух параллельных запусках
    // над одной базой.
    if (syncingRef.current) return;
    const database = getDatabase();
    if (!database) return;
    syncingRef.current = true;
    setPhase('syncing');
    try {
      const { getSupabaseClient, createSupabaseRemote, runFullSync } = await loadSyncModules();
      const client = getSupabaseClient();
      const remote = createSupabaseRemote(client);
      await runFullSync(database, remote);
      const now = new Date().toISOString();
      setLastSyncAt(now);
      setLastError(null);
      try {
        localStorage.setItem(LAST_SYNC_KEY, now);
      } catch {
        /* не страшно — просто не запомнится до следующего успеха */
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Не удалось синхронизироваться.');
    } finally {
      syncingRef.current = false;
      setPhase('paired');
    }
  }, [getDatabase]);

  // Проверка привязки при запуске — только если раньше УЖЕ была сессия
  // (см. hasStoredSession выше); иначе дневник и не тронул бы Supabase.
  useEffect(() => {
    if (phase !== 'checking') return;
    let cancelled = false;
    void (async () => {
      const { getSupabaseClient, checkIsPaired } = await loadSyncModules();
      const paired = await checkIsPaired(getSupabaseClient());
      if (cancelled) return;
      setPhase(paired ? 'paired' : 'unpaired');
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Часовой таймер + один синк сразу после привязки/запуска. Во время самого
  // синка phase меняется paired → syncing → paired, но syncEnabled остаётся
  // true, поэтому эффект НЕ перезапускается и не порождает следующий синк.
  useEffect(() => {
    if (!syncEnabled) {
      clearInterval(timerRef.current);
      return;
    }
    void runSync();
    timerRef.current = setInterval(() => void runSync(), SYNC_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncEnabled]);

  // Возвращение в приложение — тот же повод, что и у восстановления связи
  // с хранилищем (см. connection.ts): пока дневник был свёрнут, час вполне
  // мог пройти.
  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      if (phase === 'paired') void runSync();
    };
    document.addEventListener('visibilitychange', onResume);
    return () => document.removeEventListener('visibilitychange', onResume);
  }, [phase, runSync]);

  const pairWithCode = useCallback(async (code: string) => {
    const { getSupabaseClient, pairDeviceWithCode } = await loadSyncModules();
    const client = getSupabaseClient();
    const result = await pairDeviceWithCode(client, code);
    if (result.ok) {
      setLastError(null);
      setPhase('paired');
      return { ok: true };
    }
    const message =
      result.reason === 'network'
        ? 'Нет связи с облаком. Проверьте интернет и попробуйте ещё раз.'
        : result.reason === 'weak-password'
          ? 'Код слишком короткий для облака — придумайте длиннее.'
          : 'Не удалось привязать устройство. Попробуйте ещё раз.';
    setLastError(message);
    return { ok: false, message };
  }, []);

  const unpair = useCallback(async () => {
    const { getSupabaseClient, unpairDevice } = await loadSyncModules();
    await unpairDevice(getSupabaseClient());
    setPhase('unpaired');
    setLastError(null);
  }, []);

  return { phase, lastSyncAt, lastError, isCodeTooWeak, pairWithCode, unpair, syncNow: runSync };
}
