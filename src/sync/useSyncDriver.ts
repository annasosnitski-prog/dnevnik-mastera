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

// Раз в шесть часов, пока дневник открыт. Не час и не «при каждом
// открытии»: полный прогон перечитывает ВСЮ библиотеку — все записи
// целиком, со снимками, и всё это на главном потоке, том самом, который
// рисует экран. Синхронность дневнику не нужна (правки могут доехать и
// через несколько часов), а цена частых прогонов — тормоза при работе и
// риск, что телефон убьёт вкладку по памяти прямо посреди синка.
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
const LAST_SYNC_KEY = 'inka-sync-last-at';

// Отметка «прогон идёт». Ставится перед runFullSync, снимается в finally —
// то есть переживает и успех, и сбой. Если при старте хука отметка уже на
// месте, значит вкладка умерла ПОСЕРЕДИНЕ синка (не успела дойти до finally):
// автозапуск в этом случае пропускается (см. эффект ниже), чтобы дневник не
// перезапускал тот же сбой на каждой перезагрузке. Западня, из-за которой
// снятие отметки живёт именно в finally, а не отдельной строкой после него:
// успешный синк сам вызывает window.location.reload() (см. runSync) —
// код после try/catch/finally в этом случае просто не выполнится, и отметка
// осталась бы навсегда, выключив автосинк насовсем.
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
        // Перезагрузка теперь бывает только после НАЖАТОЙ кнопки: мастер сама
        // попросила синк и ждёт, что экран покажет приехавшее. Круга из
        // перезагрузок отсюда больше не выйдет — при открытии дневник не
        // синхронизируется вовсе, так что перезапускать себя по кругу нечему.
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

  // ОТКРЫТИЕ ДНЕВНИКА СИНК НЕ ЗАПУСКАЕТ — вообще. Заводится только
  // повторяющаяся проверка раз в шесть часов, и то лишь пока дневник открыт.
  //
  // Раньше синк шёл и при каждом открытии, и при каждом возврате к вкладке
  // (а на телефоне это ещё и каждое переключение приложения). Полный прогон
  // занимает главный поток на десятки секунд, поэтому дневник тормозил ровно
  // в ту минуту, когда мастер к нему вернулась и начала работать, — а на
  // телефоне вкладку успевало убить по памяти прямо посреди прогона.
  //
  // Мгновенная свежесть дневнику не нужна: правки с другого устройства могут
  // доехать и через несколько часов. Когда нужно наверняка и сейчас — есть
  // кнопка «Синхронизировать сейчас», она не ограничена ничем.
  useEffect(() => {
    if (!syncEnabled) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => void runSync(false), SYNC_INTERVAL_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncEnabled]);

  // Отметка, пережившая закрытие дневника, значит, что прогон оборвался на
  // середине и вкладка до конца не дожила (штатный уход страницы отметку
  // снимает, см. pagehide ниже). Сам по себе этот случай больше ничего не
  // отменяет — при открытии синк и так не запускается, — но в журнал он
  // обязан попасть: это единственное доказательство, что телефон не
  // вытягивает полный прогон.
  useEffect(() => {
    if (!staleSyncFlagRef.current) return;
    staleSyncFlagRef.current = false;
    clearSyncInProgressFlag();
    onErrorLog?.('', 'вкладка не пережила синхронизацию — прогон оборвался на середине');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Отличаем «вкладку убило» от «страница ушла штатно».
  //
  // Отметка о прогоне ставится перед синком и снимается по завершении, а
  // оставшаяся отметка означает, что прогон не дожил. Но не дожить он мог
  // и без всякого падения: мастер закрыла дневник, или дневник сам
  // перезагрузился, подхватив новую версию (см. main.tsx) — а синк идёт
  // десятки секунд и начинается сразу при открытии, так что попасть под
  // это легко. Обе ночи подряд журнал ловил именно такие, ложные случаи.
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
