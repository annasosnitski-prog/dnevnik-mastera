import React from 'react';
import ReactDOM from 'react-dom/client';
import TattoDiary from './components/TattoDiary';
import { ErrorBoundary } from './components/ErrorBoundary';
import { decideUpdate, isBusy, parseReloadGuard, type ReloadGuard } from './lib/appUpdate';
import './index.css';
import './components/ui/LightJewelryTheme.css';

// ─────────────── Обновление до свежего деплоя ───────────────
// Приложение, установленное на домашний экран iPhone, может неделями жить в
// фоне, ни разу не перезагрузив страницу, — а значит, продолжать выполнять
// JS того деплоя, при котором его последний раз открыли «с нуля».
//
// Здесь уже была попытка это лечить (registration.update() при возврате из
// фона + перезагрузка по controllerchange), но она была бесполезной: sw.js
// был побайтово одинаковым в каждой сборке, браузер считал воркер
// неизменившимся и новый не устанавливал — значит, controllerchange не
// наступал никогда. Теперь sw.js штампуется идентификатором сборки
// (см. vite.config.ts), поэтому этот путь наконец работает.
//
// Плюс независимая проверка /version.json: она не полагается на
// сервис-воркер вообще и вытаскивает приложение даже из того состояния, в
// которое оно уже попало со сломанным воркером.
//
// И главное — КОГДА перезагружаться. Раньше ответ был «немедленно, как
// только заметили», и это давало два раздражающих сюжета: перезагрузка
// посреди заполнения формы (введённое пропадало) и бесконечный цикл
// перезапусков, если перезагрузка новую версию так и не подхватывала.
// Оба решения теперь в lib/appUpdate.ts, здесь только их исполнение.

const RELOAD_GUARD_KEY = 'inka-last-update-reload';
// Как часто переспрашиваем «мастер уже освободилась?», когда обновление
// найдено, но откладывается. Только чтение атрибута из DOM — дёшево.
const BUSY_RECHECK_MS = 4000;

let reloadRequested = false;
// Версия на сервере, ради которой ждём удобного момента.
let deferredBuildId: string | null = null;
let busyTimer: ReturnType<typeof setInterval> | undefined;
// Проверка версии уже идёт: visibilitychange и pageshow при возврате из фона
// приходят оба, и без этого флага каждый возврат стоил двух запросов.
let checkInFlight = false;

function readGuard(): ReloadGuard | null {
  try {
    return parseReloadGuard(sessionStorage.getItem(RELOAD_GUARD_KEY));
  } catch {
    return null;
  }
}

function writeGuard(guard: ReloadGuard) {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify(guard));
  } catch {
    /* sessionStorage недоступен — полагаемся на флаг в памяти */
  }
}

function stopBusyWatch() {
  if (busyTimer === undefined) return;
  clearInterval(busyTimer);
  busyTimer = undefined;
}

// Обновление найдено, но момент неподходящий: ждём, пока мастер закроет
// форму. Никаких плашек — обновление её не касается, оно должно случиться
// незаметно, просто не поперёк работы.
function watchForFreeMoment(deployed: string) {
  deferredBuildId = deployed;
  if (busyTimer !== undefined) return;
  busyTimer = setInterval(() => {
    if (deferredBuildId === null) {
      stopBusyWatch();
      return;
    }
    applyUpdateDecision(deferredBuildId);
  }, BUSY_RECHECK_MS);
}

function applyUpdateDecision(deployed: string) {
  if (reloadRequested) return;
  const decision = decideUpdate({
    currentBuildId: __BUILD_ID__,
    deployedBuildId: deployed,
    busy: isBusy(document.documentElement),
    now: Date.now(),
    guard: readGuard(),
  });
  if (decision.kind === 'reload') {
    deferredBuildId = null;
    stopBusyWatch();
    writeGuard(decision.guard);
    reloadRequested = true;
    window.location.reload();
    return;
  }
  if (decision.kind === 'defer') {
    watchForFreeMoment(deployed);
    return;
  }
  // 'up-to-date' и 'give-up' одинаковы в одном: ждать больше нечего.
  // Про 'give-up' (две перезагрузки не подхватили новую версию) молчим
  // намеренно — дневник исправно работает на текущей, а мастер ничего с
  // этим сделать не может; чинить это нам, по журналу сбоев.
  deferredBuildId = null;
  stopBusyWatch();
}

async function checkForNewBuild() {
  if (reloadRequested || checkInFlight) return;
  checkInFlight = true;
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data: unknown = await response.json();
    const deployed = (data as { buildId?: unknown } | null)?.buildId;
    if (typeof deployed === 'string') applyUpdateDecision(deployed);
  } catch {
    /* офлайн или сеть барахлит — работаем дальше на текущей версии */
  } finally {
    checkInFlight = false;
  }
}

// Перезагрузка по смене сервис-воркера подчиняется тем же правилам: посреди
// заполненной формы она так же стирает введённое. Версия сервера здесь
// неизвестна, поэтому спрашиваем её тем же способом.
function reloadForNewWorker() {
  void checkForNewBuild();
}

if (import.meta.env.PROD) {
  const onResume = () => {
    if (document.visibilityState !== 'visible') return;
    void checkForNewBuild();
  };
  document.addEventListener('visibilitychange', onResume);
  // Возврат из bfcache («заморозки» вкладки) не всегда даёт visibilitychange.
  window.addEventListener('pageshow', onResume);
  void checkForNewBuild();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update();
        });
      })
      .catch((err) => console.log('SW registration failed:', err));

    // При первой в жизни установке воркер тоже забирает управление
    // (clients.claim), но перезагружать там нечего — код и так свежий.
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      reloadForNewWorker();
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TattoDiary />
    </ErrorBoundary>
  </React.StrictMode>,
);
