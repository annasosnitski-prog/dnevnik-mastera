import { useState, useRef } from 'react';
import { BusinessSettings } from '../db/types';
import { downloadBackup, importBackup } from '../utils/backup';

interface Props {
  settings: BusinessSettings;
  onSave: (updates: Partial<BusinessSettings>) => Promise<void>;
  // Внутри дневника перезагружать всю страницу после импорта не нужно —
  // кабала просто перечитывает свои данные из IndexedDB.
  onImported: () => Promise<void>;
}

export function SettingsScreen({ settings, onSave, onImported }: Props) {
  const [form, setForm] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [importError, setImportError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof BusinessSettings>(key: K, value: BusinessSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    await downloadBackup();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('idle');
    setImportError('');
    try {
      const confirmed = window.confirm(
        'Импорт заменит текущие данные. Продолжить?'
      );
      if (!confirmed) return;
      await importBackup(file);
      setImportStatus('ok');
      await onImported();
    } catch (err) {
      setImportStatus('error');
      setImportError((err as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="screen">
      <div className="report-header">
        <h2 className="report-title">Настройки</h2>
      </div>

      <div className="settings-section-title">Данные бизнеса</div>

      <div className="field-group">
        <label className="field-label">Имя / Название бизнеса</label>
        <input
          className="field-input"
          type="text"
          value={form.ownerName}
          onChange={(e) => set('ownerName', e.target.value)}
          placeholder="Имя Фамилия или Название"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Номер עוסק</label>
        <input
          className="field-input"
          type="text"
          inputMode="numeric"
          value={form.oseqNumber}
          onChange={(e) => set('oseqNumber', e.target.value)}
          placeholder="000000000"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Адрес</label>
        <input
          className="field-input"
          type="text"
          value={form.address}
          onChange={(e) => set('address', e.target.value)}
          placeholder="Улица, город"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Телефон</label>
        <input
          className="field-input"
          type="tel"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="050-0000000"
        />
      </div>

      <div className="field-group">
        <label className="field-label">Email</label>
        <input
          className="field-input"
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="your@email.com"
        />
      </div>

      <div className="settings-section-title" style={{ marginTop: 24 }}>Нумерация и лимиты</div>

      <div className="field-group">
        <label className="field-label">
          Следующий номер кабалы
          <span className="field-optional"> (текущий счётчик: #{settings.nextReceiptNumber})</span>
        </label>
        <input
          className="field-input"
          type="number"
          min={settings.nextReceiptNumber}
          value={form.nextReceiptNumber}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            if (v >= settings.nextReceiptNumber) set('nextReceiptNumber', v);
          }}
        />
        {form.nextReceiptNumber !== settings.nextReceiptNumber && (
          <div className="field-hint">
            ⚠️ Изменение номера не может идти назад (мин: {settings.nextReceiptNumber})
          </div>
        )}
      </div>

      <div className="field-group">
        <label className="field-label">Годовой лимит дохода (₪)</label>
        <input
          className="field-input"
          type="number"
          min={0}
          step={1000}
          inputMode="numeric"
          value={form.annualIncomeLimit}
          onChange={(e) => set('annualIncomeLimit', parseFloat(e.target.value) || 0)}
        />
        <div className="field-hint">Текущий лимит עוסק פטור — проверяйте актуальную цифру у бухгалтера</div>
      </div>

      <div className="field-group">
        <label className="field-label">Расчётный год</label>
        <input
          className="field-input"
          type="number"
          value={form.currentYear}
          min={2020}
          max={2099}
          onChange={(e) => set('currentYear', parseInt(e.target.value) || new Date().getFullYear())}
        />
      </div>

      <button
        className="btn-save"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Сохранение...' : saved ? '✓ Сохранено' : 'Сохранить'}
      </button>

      {/* Backup section */}
      <div className="settings-section-title" style={{ marginTop: 32 }}>Резервная копия</div>

      <div className="backup-card">
        <p className="backup-note">
          Данные хранятся локально на устройстве. Регулярно делайте резервные копии.
        </p>

        <button className="backup-btn" onClick={handleExport}>
          ↓ Скачать резервную копию (JSON)
        </button>

        <button
          className="backup-btn backup-btn-import"
          onClick={() => fileRef.current?.click()}
        >
          ↑ Восстановить из файла
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />

        {importStatus === 'ok' && (
          <div className="import-ok">✓ Данные восстановлены</div>
        )}
        {importStatus === 'error' && (
          <div className="import-error">✗ {importError}</div>
        )}
      </div>

      {/* Version */}
      <div className="app-version">Кабала · עוסק פטור · внутри дневника мастера</div>
    </div>
  );
}
