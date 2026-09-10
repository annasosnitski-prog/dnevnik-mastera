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
//
// Два добавления поверх этого: (1) каждый сбой синка теперь уходит в общий
// журнал (lib/errorLog.ts, источник 'sync') через onErrorLog — раньше он
// оседал только в lastError и пропадал при следующей перезагрузке; (2)
// защита от петли падений — см. lib/syncCrashGuard.ts за тем, ПОЧЕМУ она
// вообще понадобилась, здесь только её исполнение поверх localStorage.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { isCodeTooWeak } from '../lib/syncIdentity.js';
import { decideSyncStartup, syncCrashExplanation, syncCrashLogMessage, SYNC_STARTED_AT_KEY } from '../lib/syncCrashGuard.js';
import { isAuthLikeSyncError } from './syncRetryPolicy.js';
import { SYNC_ACTIONS } from './syncMessages.js';

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

export function useSyncDriver(
  getDatabase: () => IDBDatabase | null,
  // Необязательный: сюда прокидывается общий журнал сбоев (TattoDiary.tsx
  // передаёт logError с источником 'sync'). Необязательность — чтобы хук
  // оставался вызываемым и без журнала, как и раньше.
  onErrorLog?: (action: string, error: unknown) => void,
): SyncDriverState {
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
  // Замок от петли падений (см. lib/syncCrashGuard.ts). Ref, а не state:
  // должен быть виден сразу внутри уже живущих замыканий (часовой интервал,
  // обработчик возврата из фона) без пересоздания их эффектов, и не обязан
  // переживать «просто ещё один рендер» как настоящее состояние компонента.
  const autoSyncLockedRef = useRef(false);

  // paired и syncing — два UI-состояния одной и той же привязки.
  // Для таймера это ОБА «синк включён»: если считать syncing выключением,
  // каждая синхронизация сама очистит эффект, а возврат в paired тут же
  // создаст его заново и немедленно запустит следующий синк — бесконечный цикл.
  const syncEnabled = phase === 'paired' || phase === 'syncing';

  // Однократная проверка при монтировании: если отметка «прогон начался»
  // (SYNC_STARTED_AT_KEY) осталась висеть, предыдущий прогон не долетел до
  // своего finally — вкладка упала прямо во время синка (см.
  // lib/syncCrashGuard.ts). Обычный try/catch этого не ловит: процесс
  // страницы не бросает исключение, он просто исчезает вместе со всем
  // стеком вызовов.
  //
  // Реакция — не молчать и не пытаться снова тем же способом: заблокировать
  // автозапуск (эффекты ниже это проверяют), объяснить в lastError, что
  // нужно нажать «Синхронизировать сейчас» самой, и оставить в журнале
  // сбоев доказательство, которого раньше не было вообще.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SYNC_STARTED_AT_KEY);
    } catch {
      raw = null;
    }
    const decision = decideSyncStartup(raw);
    if (decision.kind !== 'crashed') return;
    autoSyncLockedRef.current = true;
    setLastError(syncCrashExplanation(decision.startedAt));
    onErrorLog?.(SYNC_ACTIONS.runSync, syncCrashLogMessage(decision.startedAt));
    try {
      localStorage.removeItem(SYNC_STARTED_AT_KEY);
    } catch {
      /* не страшно — свою службу отметка уже сослужила (лог записан) */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSync = useCallback(
    async (refreshVisibleData = false) => {
      if (syncingRef.current) return;
      const database = getDatabase();
      if (!database) {
        setLastError('Локальное хранилище ещё не готово. Попробуйте синхронизацию ещё раз через несколько секунд.');
        return;
      }
      // Любой настоящий прогон — в том числе автоматический, но он попадает
      // сюда, только если эффекты ниже уже сами проверили замок, — снимает
      // его: это новая попытка синка, а не продолжение прежней зависшей.
      // Иначе одна упавшая по памяти синхронизация отключила бы автосинк
      // навсегда, хотя мастер уже вручную попробовала снова.
      autoSyncLockedRef.current = false;
      syncingRef.current = true;
      setPhase('syncing');
      try {
        localStorage.setItem(SYNC_STARTED_AT_KEY, new Date().toISOString());
      } catch {
        /* нет localStorage — защита от петли не сработает, но сам синк не страдает */
      }
      try {
        const { getSupabaseClient, createSupabaseRemote, runFullSync } = await loadSyncModules();
        const client = getSupabaseClient();
        // Один повтор через паузу — но только при сбое, похожем на ошибку
        // авторизации (см. syncRetryPolicy.ts за тем, почему сужено): сразу
        // после входа (pairWithCode) Supabase иногда отвечает 401 на первый
        // же запрос данных — токен уже выдан, но ещё не везде
        // распространился; через секунду-другую тот же запрос проходит сам.
        // Слияние идемпотентно (см. syncEngine.ts), поэтому повторить весь
        // прогон в этом случае безопасно. Любую другую причину сбоя (в
        // частности — нехватку памяти) тут же повторять нельзя: тяжёлый
        // прогон удвоил бы пиковое потребление в момент, когда её и так не
        // хватило.
        let summary;
        try {
          const remote = await createSupabaseRemote(client);
          summary = await runFullSync(database, remote);
        } catch (err) {
          if (!isAuthLikeSyncError(err)) throw err;
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const remote = await createSupabaseRemote(client);
          summary = await runFullSync(database, remote);
        }
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

        // Отметку снимаем ЗДЕСЬ, до перезагрузки, а не полагаемся на finally
        // ниже: reload() не обрывает синхронный JS немедленно, но полагаться
        // на это не стоит — если снятие отметки хоть иногда не долетит до
        // перезагрузки, каждая штатная синхронизация с перезагрузкой будет
        // выглядеть как падение, и автосинк отключится навсегда своими же
        // руками.
        try {
          localStorage.removeItem(SYNC_STARTED_AT_KEY);
        } catch {
          /* см. комментарий у localStorage.setItem выше по установке отметки */
        }
        if (refreshVisibleData && pulledSomething) {
          window.location.reload();
          return;
        }
      } catch (err) {
        setLastError(err instanceof Error ? err.message : 'Не удалось синхронизироваться.');
        onErrorLog?.(SYNC_ACTIONS.runSync, err);
      } finally {
        // Идемпотентно: при успехе отметка уже снята выше, здесь просто
        // подчищаем путь сбоя (и подстраховываем путь успеха, если он
        // почему-то до сюда дошёл).
        try {
          localStorage.removeItem(SYNC_STARTED_AT_KEY);
        } catch {
          /* см. комментарий выше */
        }
        syncingRef.current = false;
        // Возвращаем 'paired' ТОЛЬКО если за время синка привязку не сняли.
        // Безусловный setPhase('paired') откатывал бы отвязку, нажатую пока
        // синк ещё шёл: устройство снова считалось бы привязанным, syncEnabled
        // становился true, эффект с таймером оживал — и отвязанный дневник
        // продолжал бы ходить в облако.
        setPhase((current) => (current === 'syncing' ? 'paired' : current));
      }
    },
    [getDatabase, onErrorLog],
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
        onErrorLog?.(SYNC_ACTIONS.checkPairing, err);
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
  //
  // Замок от петли падений подчиняется тому же правилу и здесь, и в
  // обработчике возврата из фона ниже: если прошлый прогон не долетел до
  // конца, ни первый синк после запуска, ни часовой таймер не должны
  // попробовать тем же способом снова сами. Кнопка «Синхронизировать
  // сейчас» (syncNow → runSync) замок не проверяет и сама его снимает —
  // сюда достаточно ручной попытки мастера, а не ещё одной автоматической.
  useEffect(() => {
    if (!syncEnabled) {
      clearInterval(timerRef.current);
      return;
    }
    if (!autoSyncLockedRef.current) void runSync(true);
    timerRef.current = setInterval(() => {
      if (autoSyncLockedRef.current) return;
      void runSync(false);
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncEnabled]);

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      if (phase === 'paired' && !autoSyncLockedRef.current) void runSync(false);
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
    onErrorLog?.(SYNC_ACTIONS.pairDevice, result.message || message);
    return { ok: false, message };
  }, [onErrorLog]);

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
