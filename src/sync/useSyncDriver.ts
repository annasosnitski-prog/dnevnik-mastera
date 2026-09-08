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
import { isCodeTooWeak } from '../lib/syncIdentity.js';

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

  const runSync = useCallback(
    async (refreshVisibleData = false) => {
      if (syncingRef.current) return;
      const database = getDatabase();
      if (!database) {
        setLastError('Локальное хранилище ещё не готово. Попробуйте синхронизацию ещё раз через несколько секунд.');
        return;
      }
      syncingRef.current = true;
      setPhase('syncing');
      try {
        const { getSupabaseClient, createSupabaseRemote, runFullSync } = await loadSyncModules();
        const client = getSupabaseClient();
        const remote = await createSupabaseRemote(client);
        const summary = await runFullSync(database, remote);
        const now = new Date().toISOString();
        setLastSyncAt(now);
        setLastError(null);
        try {
          localStorage.setItem(LAST_SYNC_KEY, now);
        } catch {
          /* не страшно — просто не запомнится до следующего успеха */
        }

        // runFullSync пишет приехавшие данные прямо в IndexedDB, а React-экран
        // держит свой снимок clients/projects/contentEntries/masterInfo в state.
        // Без перечитывания база уже слита, но мастер видит старый экран до
        // следующего запуска приложения. На первом синке после запуска и на
        // ручной кнопке безопасно перезагружаем только если реально что-то
        // ПРИЕХАЛО/удалилось локально. Следующий запуск уже увидит слитую базу,
        // поэтому цикла перезагрузок не будет.
        const pulledSomething =
          summary.clients.pulled > 0 ||
          summary.clients.deletedLocally > 0 ||
          summary.projects.pulled > 0 ||
          summary.projects.deletedLocally > 0 ||
          summary.contentEntries.pulled > 0 ||
          summary.contentEntries.deletedLocally > 0 ||
          summary.masterInfo === 'pulled';
        if (refreshVisibleData && pulledSomething) {
          window.location.reload();
          return;
        }
      } catch (err) {
        setLastError(err instanceof Error ? err.message : 'Не удалось синхронизироваться.');
      } finally {
        syncingRef.current = false;
        setPhase('paired');
      }
    },
    [getDatabase],
  );

  useEffect(() => {
    if (phase !== 'checking') return;
    let cancelled = false;
    void (async () => {
      try {
        const { getSupabaseClient, checkIsPaired } = await loadSyncModules();
        const paired = await checkIsPaired(getSupabaseClient());
        if (cancelled) return;
        setPhase(paired ? 'paired' : 'unpaired');
      } catch (err) {
        if (cancelled) return;
        setLastError(err instanceof Error ? err.message : 'Не удалось проверить привязку синка.');
        setPhase('unpaired');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Первый синк после запуска/привязки обновляет видимый экран, если из
  // облака реально приехали изменения. Часовые фоновые проверки НЕ должны
  // внезапно перезагружать приложение во время работы.
  useEffect(() => {
    if (!syncEnabled) {
      clearInterval(timerRef.current);
      return;
    }
    void runSync(true);
    timerRef.current = setInterval(() => void runSync(false), SYNC_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncEnabled]);

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      if (phase === 'paired') void runSync(false);
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
          : result.reason === 'confirmation-required'
            ? 'Supabase не выдал сессию. В Authentication → Sign In / Providers → Email выключите Confirm email, затем привяжите устройство заново.'
            : result.message || 'Не удалось привязать устройство. Попробуйте ещё раз.';
    setLastError(message);
    return { ok: false, message };
  }, []);

  const unpair = useCallback(async () => {
    const { getSupabaseClient, unpairDevice } = await loadSyncModules();
    await unpairDevice(getSupabaseClient());
    setPhase('unpaired');
    setLastError(null);
  }, []);

  return {
    phase,
    lastSyncAt,
    lastError,
    isCodeTooWeak,
    pairWithCode,
    unpair,
    syncNow: () => runSync(true),
  };
}
