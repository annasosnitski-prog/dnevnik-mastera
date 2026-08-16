import React from 'react';
import ReactDOM from 'react-dom/client';
import TattoDiary from './components/TattoDiary';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/tokens.css';
import './index.css';

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

const RELOAD_GUARD_KEY = 'inka-last-update-reload';
const RELOAD_GUARD_MS = 60_000;
let reloadRequested = false;

function reloadForNewBuild() {
  if (reloadRequested) return;
  // Страховка от петли: если новая версия почему-то всё равно не
  // подхватывается, лучше остаться на старой, чем перезагружаться по кругу.
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    if (Number.isFinite(last) && Date.now() - last < RELOAD_GUARD_MS) return;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* sessionStorage недоступен — полагаемся на флаг в памяти */
  }
  reloadRequested = true;
  window.location.reload();
}

async function checkForNewBuild() {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data: unknown = await response.json();
    const deployed = (data as { buildId?: unknown } | null)?.buildId;
    if (typeof deployed === 'string' && deployed !== __BUILD_ID__) reloadForNewBuild();
  } catch {
    /* офлайн или сеть барахлит — работаем дальше на текущей версии */
  }
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
      reloadForNewBuild();
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
