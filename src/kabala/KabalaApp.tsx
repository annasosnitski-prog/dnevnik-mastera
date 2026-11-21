import { useState } from 'react';
import { Screen } from './db/types';
import { useSettings } from './hooks/useSettings';
import { useReceipts } from './hooks/useReceipts';
import { MainScreen } from './screens/MainScreen';
import { NewReceiptScreen } from './screens/NewReceiptScreen';
import { ReceiptViewScreen } from './screens/ReceiptViewScreen';
import { ReportScreen } from './screens/ReportScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import './kabala.css';

type Tab = 'main' | 'report' | 'settings';

// Кабала (קבלות, квитанции עוסק פטור) — перенесена из отдельного
// приложения (репозиторий 4321) во вкладку «Кабала» Личного кабинета.
// Данные, как и раньше, только на этом устройстве: своя IndexedDB
// 'kabala-db' (см. db/db.ts), в синхронизацию дневника не входит. Старые
// данные переносятся файлом: «Скачать резервную копию» в прежнем
// приложении → «Восстановить из файла» в настройках кабалы здесь.
export function KabalaApp() {
  const { settings, loading: sLoading, updateSettings, reload: reloadSettings } = useSettings();
  const { receipts, lastReceipt, loading: rLoading, issueReceipt, stornoReceipt, reload: reloadReceipts } = useReceipts();

  const [screen, setScreen] = useState<Screen>('main');
  const [activeTab, setActiveTab] = useState<Tab>('main');

  const loading = sLoading || rLoading;

  if (loading) {
    return (
      <div className="kabala-root"><div className="app-loading">
        <div className="loading-he">קבלות</div>
        <div className="loading-sub">Загрузка...</div>
      </div></div>
    );
  }

  function navTo(s: Screen) {
    setScreen(s);
    if (s === 'main') setActiveTab('main');
    else if (s === 'report') setActiveTab('report');
    else if (s === 'settings') setActiveTab('settings');
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    setScreen(tab);
  }

  const isFullscreen = screen === 'new-receipt' || (typeof screen === 'object' && screen.type === 'view');

  return (
    <div className="kabala-root"><div className="app">
      {!isFullscreen && (
        <nav className="bottom-nav">
          <button
            className={`nav-btn ${activeTab === 'main' ? 'nav-active' : ''}`}
            onClick={() => handleTabChange('main')}
          >
            <span className="nav-icon">🏠</span>
            <span className="nav-label">Главная</span>
          </button>
          <button
            className={`nav-btn ${activeTab === 'report' ? 'nav-active' : ''}`}
            onClick={() => handleTabChange('report')}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-label">Отчёт</span>
          </button>
          <button
            className={`nav-btn ${activeTab === 'settings' ? 'nav-active' : ''}`}
            onClick={() => handleTabChange('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Настройки</span>
          </button>
        </nav>
      )}
      <div className={`screen-wrap ${isFullscreen ? 'fullscreen' : ''}`}>
        {screen === 'main' && (
          <MainScreen
            receipts={receipts}
            settings={settings}
            onNewReceipt={() => navTo('new-receipt')}
            onViewReceipt={(id) => navTo({ type: 'view', id })}
          />
        )}

        {screen === 'new-receipt' && (
          <NewReceiptScreen
            settings={settings}
            lastReceipt={lastReceipt}
            onIssue={(form) => issueReceipt(form, settings)}
            onBack={() => navTo('main')}
            onViewAfterIssue={(id) => {
              reloadReceipts();
              reloadSettings();
              navTo({ type: 'view', id });
            }}
          />
        )}

        {typeof screen === 'object' && screen.type === 'view' && (
          <ReceiptViewScreen
            receiptId={screen.id}
            settings={settings}
            onBack={() => {
              setScreen(activeTab);
            }}
            onStorno={async (original, date) => {
              const storno = await stornoReceipt(original, settings, date);
              await reloadSettings();
              return storno;
            }}
            onViewAfterStorno={(id) => {
              reloadReceipts();
              navTo({ type: 'view', id });
            }}
          />
        )}

        {screen === 'report' && (
          <ReportScreen
            settings={settings}
            onViewReceipt={(id) => navTo({ type: 'view', id })}
          />
        )}

        {screen === 'settings' && (
          <SettingsScreen
            settings={settings}
            onSave={(updates) => updateSettings(updates)}
            onImported={async () => {
              await Promise.all([reloadSettings(), reloadReceipts()]);
            }}
          />
        )}
      </div>

    </div></div>
  );
}
