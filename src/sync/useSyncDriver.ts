// ============================================================
// ХУК ПРИВЯЗКИ И ПЕРИОДИЧЕСКОГО СИНКА — Шаг 5 синка (docs/SYNC_PLAN.md).
//
// Единственное место, где дневник знает про Supabase. Экран настроек
// получает готовые значения и функции (paired/pairWithCode/syncNow/...),
// а не сам Supabase — так же, как остальной дневник получает
// onMeasureStorage вместо прямого доступа к IndexedDB.
//
// Живёт на верхнем уровне компонента (не внутри экрана настроек), потому
// что периодическая проверка обязана идти, пока мастер работает где угодно
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

// Раз в 12 часов — не реже: мастер работает на нескольких устройствах и
// хочет, чтобы правка долетала сама, без нажатой кнопки, минимум пару раз
// в сутки. Проверяется и по таймеру (пока вкладка открыта долго), и при
// каждом открытии/возврате к вкладке — но только если с прошлого успешного
// синка прошло больше этого срока (lastSyncOverdue), иначе просто откроется
// дневник без похода в облако.
//
// Раньше (до Шага 7, docs/SYNC_PLAN.md) синк на каждое открытие был
// небезопасен: полный прогон поднимал в память ВСЮ библиотеку целиком, со
// снимками, и мог убить вкладку по памяти прямо посреди работы. Шаг 7 это
// убрал — решение «что синкать» дешёвое (метаданные), а перенос идёт по
// одной записи, — поэтому повторять проверку на каждом открытии снова
// безопасно.
const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const LAST_SYNC_KEY = 'inka-sync-last-at';

function lastSyncOverdue(gapMs: number): boolean {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    if (!raw) return true;
    const since = Date.now() - new Date(raw).getTime();
    // Отметка из будущего (переведённые часы) — не повод откладывать синк
    // навсегда.
    return since < 0 || since >= gapMs;
  } catch {
    return true;
  }
}

// Отметка «прогон идёт». Ставится перед runFullSync, снимается в finally —
// то есть переживает и успех, и сбой; штатный уход страницы снимает её
// отдельно (см. pagehide ниже). Поэтому отметка, найденная при открытии,
// значит ровно одно: вкладка умерла ПОСЕРЕДИНЕ синка, не дойдя до finally.
// В этом случае автозапуск при открытии пропускается один раз (см. эффект
// ниже) — иначе дневник тут же попытался бы повторить тот же сбой, — а
// запись в журнал уходит: это единственное доказательство, что устройство
// не вытягивает полный прогон.
//
// Западня, из-за которой снятие отметки живёт именно в finally, а не
// отдельной строкой после него: успешный синк по кнопке вызывает
// window.location.reload() (см. runSync), и код после try/catch/finally в
// этом случае просто не выполнится — отметка осталась бы навсегда и
// объявляла бы падением каждое следующее открытие.
const SYNC_IN_PROGRESS_KEY = 'inka-sync-in-progress';

function hasSyncInProgressFlag(): boolean {
  try {
    return localStorage.getItem(SYNC_IN_PROGRESS_KEY) !== null;
  } catch {
    return false;
  }
}

function setSyncInProgressFlag(): void {
  try {
    localStorage.setItem(SYNC_IN_PROGRESS_KEY, '1');
  } catch {
    /* защита от петли не сработает, но сам синк это не остановит */
  }
}

function clearSyncInProgressFlag(): void {
  try {
    localStorage.removeItem(SYNC_IN_PROGRESS_KEY);
  } catch {
    /* ignore */
  }
}

// Ошибка, ради которой вообще завели повтор в #302: сразу после входа
// Supabase иногда отвечает 401 на первый же запрос — токен уже выдан, но ещё
// не везде распространился. Повтор оправдан ТОЛЬКО для этого случая: любая
// другая ошибка (сеть легла, RLS не пускает, таблицы нет) второй раз сама
// себя не починит, а повторный тяжёлый прогон поверх первого — лишняя
// нагрузка и лишний источник рассинхрона.
function isAuthPropagationFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { status?: unknown; code?: unknown; message?: unknown };
  if (e.status === 401) return true;
  if (typeof e.code === 'string' && e.code.toUpperCase().includes('JWT')) return true;
  return typeof e.message === 'string' && /\b401\b|JWT/i.test(e.message);
}

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

// onErrorLog — та же проводка, что и onErrorLog у createStorageConnection:
// хук пишет закрытым текстом в React-состояние экрана настроек (см.
// TattoDiary.tsx, logError), а не сам в localStorage — иначе журнал в
// Настройках не увидел бы свежую запись без перезагрузки.
export function useSyncDriver(
  getDatabase: () => IDBDatabase | null,
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
  // Значение отметки НА МОМЕНТ ОТКРЫТИЯ хука — до того, как runSync успеет её
  // хоть раз выставить в этом сеансе. Читается лениво (один раз), кладётся в
  // ref: эффект ниже снимает её сам при использовании, а ref, в отличие от
  // state, не просит лишний рендер ради этого.
  const [initialStaleSyncFlag] = useState(hasSyncInProgressFlag);
  const staleSyncFlagRef = useRef(initialStaleSyncFlag);

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
      setSyncInProgressFlag();
      setPhase('syncing');
      try {
        const { getSupabaseClient, createSupabaseRemote, runFullSync } = await loadSyncModules();
        const client = getSupabaseClient();
        // Один повтор через паузу — но только при 401 сразу после входа (см.
        // isAuthPropagationFailure): токен уже выдан, но ещё не везде
        // распространился, и через секунду-другую тот же запрос проходит сам
        // (в логах соседний вызов той же секунды уже 200). Слияние
        // идемпотентно (см. syncEngine.ts), поэтому повторить прогон в этом
        // случае безопасно. Любая другая ошибка не подходит: она не пройдёт
        // и вторым разом, а тяжёлый прогон запустился бы поверх первого,
        // который мог успеть что-то отправить или записать локально.
        let summary;
        try {
          const remote = await createSupabaseRemote(client);
          summary = await runFullSync(database, remote);
        } catch (err) {
          if (!isAuthPropagationFailure(err)) throw err;
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
        // refreshVisibleData=true — и у кнопки, и у автозапуска при открытии
        // (см. эффект ниже): в обоих случаях мастер только что открыла
        // дневник или явно попросила синк, реагировать на приехавшее уместно.
        // Круга из перезагрузок отсюда не выйдет: сразу после успешного синка
        // lastSyncOverdue() становится false (LAST_SYNC_KEY только что
        // обновлён), поэтому автозапуск на СЛЕДУЮЩЕМ открытии (то есть сразу
        // после этой же перезагрузки) не сработает — синкать уже нечего.
        if (refreshVisibleData && pulledSomething) {
          window.location.reload();
          return;
        }
      } catch (err) {
        setLastError(err instanceof Error ? err.message : 'Не удалось синхронизироваться.');
        onErrorLog?.('', err);
      } finally {
        syncingRef.current = false;
        // Снимается здесь, а не отдельной строкой после try/catch: путь
        // успеха уходит на reload и до кода после finally не доходит (см.
        // комментарий у SYNC_IN_PROGRESS_KEY).
        clearSyncInProgressFlag();
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
        onErrorLog?.('проверка привязки', err);
        setPhase('unpaired');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Автозапуск при открытии — если с прошлого успешного синка прошло больше
  // SYNC_INTERVAL_MS (lastSyncOverdue). Плюс повторяющийся таймер на тот же
  // срок, на случай если вкладка простоит открытой дольше этого сама по
  // себе. Исключение — оборванный прошлый прогон: если отметка
  // SYNC_IN_PROGRESS_KEY уже стояла на момент открытия хука
  // (staleSyncFlagRef), значит вкладка умерла во время синка, и запускать
  // его немедленно снова значило бы воспроизвести тот же сбой на каждой
  // перезагрузке. В этом случае автозапуск пропускается ОДИН раз (кнопка
  // «Синхронизировать сейчас» и таймер остаются рабочими), а сам факт
  // падения уходит в журнал — это единственное доказательство, что
  // устройство не вытягивает полный прогон.
  useEffect(() => {
    if (!syncEnabled) {
      clearInterval(timerRef.current);
      return;
    }
    if (staleSyncFlagRef.current) {
      staleSyncFlagRef.current = false;
      clearSyncInProgressFlag();
      onErrorLog?.(
        '',
        'вкладка не пережила синхронизацию — прогон оборвался на середине; автозапуск пропущен',
      );
    } else if (lastSyncOverdue(SYNC_INTERVAL_MS)) {
      void runSync(true);
    }
    timerRef.current = setInterval(() => void runSync(false), SYNC_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncEnabled]);

  // Возврат к вкладке (свернули приложение и открыли снова) — тот же
  // автозапуск, той же проверкой на срок. На телефоне это самый частый
  // способ «открыть дневник», чаще, чем полная перезагрузка страницы.
  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      if (phase !== 'paired') return;
      if (!lastSyncOverdue(SYNC_INTERVAL_MS)) return;
      void runSync(false);
    };
    document.addEventListener('visibilitychange', onResume);
    return () => document.removeEventListener('visibilitychange', onResume);
  }, [phase, runSync]);

  // Отличаем «вкладку убило» от «страница ушла штатно».
  //
  // Отметка о прогоне ставится перед синком и снимается по завершении, а
  // оставшаяся отметка означает, что прогон не дожил. Но не дожить он мог
  // и без всякого падения: мастер закрыла дневник, пока шёл синк, или
  // дневник сам перезагрузился, подхватив новую версию (см. main.tsx).
  // Прогон идёт десятки секунд, так что попасть под это легко — журнал
  // ловил именно такие, ложные случаи.
  //
  // pagehide приходит при любом штатном уходе страницы — закрытии,
  // переходе, перезагрузке — и НЕ приходит, когда систему убивает вкладку
  // по памяти. Поэтому снимаем отметку здесь: после этого уцелевшая
  // отметка значит ровно одно — вкладка не пережила синхронизацию.
  //
  // pageshow возвращает её обратно: страницу могли заморозить (уход в фон)
  // и вернуть, а прогон при этом продолжается — и его падение мы всё ещё
  // хотим увидеть.
  useEffect(() => {
    const onLeave = () => clearSyncInProgressFlag();
    const onRestore = () => {
      if (syncingRef.current) setSyncInProgressFlag();
    };
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('pageshow', onRestore);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('pageshow', onRestore);
    };
  }, []);

  const pairWithCode = useCallback(async (code: string) => {
    const { getSupabaseClient, pairDeviceWithCode } = await loadSyncModules();
    const client = getSupabaseClient();
    const result = await pairDeviceWithCode(client, code);
    if (result.ok) {
      setLastError(null);
      setPhase('paired');
      // Синк сразу после привязки, не дожидаясь автозапуска (тот сработал бы
      // и сам — свежепривязанное устройство ещё ни разу не синкалось, и
      // lastSyncOverdue() будет true, — но не мгновенно: эффект завязан на
      // смену phase, а до неё есть кадр рендера). Устройство подключили к
      // облаку именно затем, чтобы сразу увидеть на нём свои данные.
      void runSync(true);
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
    onErrorLog?.('привязка устройства', message);
    return { ok: false, message };
  }, [onErrorLog, runSync]);

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
