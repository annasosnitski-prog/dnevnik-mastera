import { useState, useEffect } from 'react';
import { Receipt, BusinessSettings } from '../db/types';
import { dbGetReceiptsByDateRange } from '../db/db';
import {
  formatDate,
  formatCurrency,
  todayStr,
  firstOfMonth,
  prevMonthRange,
  PAYMENT_RU,
} from '../utils/formatting';
import { printReport, exportCSV } from '../utils/pdfPrint';

interface Props {
  settings: BusinessSettings;
  onViewReceipt: (id: string) => void;
}

type Preset = 'cur-month' | 'prev-month' | 'cur-year' | 'custom';

export function ReportScreen({ settings, onViewReceipt }: Props) {
  const today = todayStr();
  const year = settings.currentYear;

  const [preset, setPreset] = useState<Preset>('cur-month');
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    applyPreset(preset);
  }, []); // eslint-disable-line

  async function fetch(f: string, t: string) {
    setLoading(true);
    try {
      const rs = await dbGetReceiptsByDateRange(f, t);
      setReceipts(rs);
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(p: Preset) {
    setPreset(p);
    let f = from, t = to;
    if (p === 'cur-month') {
      f = firstOfMonth(); t = today;
    } else if (p === 'prev-month') {
      const r = prevMonthRange(); f = r.from; t = r.to;
    } else if (p === 'cur-year') {
      f = `${year}-01-01`; t = today;
    }
    setFrom(f); setTo(t);
    fetch(f, t);
  }

  function handleCustomApply() {
    if (from > to) { alert('Дата "от" не может быть позже "до"'); return; }
    fetch(from, to);
  }

  const total = receipts.reduce((s, r) => s + r.totalAmount, 0);
  const byPay: Record<string, number> = {};
  receipts.forEach((r) => {
    byPay[r.paymentMethod] = (byPay[r.paymentMethod] || 0) + r.totalAmount;
  });

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'cur-month', label: 'Текущий месяц' },
    { key: 'prev-month', label: 'Прошлый месяц' },
    { key: 'cur-year', label: `${year} год` },
    { key: 'custom', label: 'Произвольный' },
  ];

  return (
    <div className="screen">
      <div className="report-header">
        <h2 className="report-title">Отчёт</h2>
      </div>

      {/* Period presets */}
      <div className="preset-row">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`preset-btn ${preset === p.key ? 'preset-active' : ''}`}
            onClick={() => applyPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {preset === 'custom' && (
        <div className="custom-range">
          <div className="custom-range-inputs">
            <div className="field-group">
              <label className="field-label">От</label>
              <input
                className="field-input"
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label className="field-label">До</label>
              <input
                className="field-input"
                type="date"
                value={to}
                min={from}
                max={today}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <button className="btn-apply" onClick={handleCustomApply}>
            Применить
          </button>
        </div>
      )}

      {loading ? (
        <div className="report-loading">Загрузка...</div>
      ) : (
        <>
          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Итого</div>
              <div className="stat-value">{formatCurrency(total)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Чеков</div>
              <div className="stat-value">{receipts.length}</div>
            </div>
          </div>

          {/* By payment method */}
          {Object.keys(byPay).length > 0 && (
            <div className="pay-breakdown">
              {Object.entries(byPay).map(([m, a]) => (
                <div key={m} className="pay-row">
                  <span className="pay-method">{PAYMENT_RU[m] || m}</span>
                  <span className="pay-amount">{formatCurrency(a)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Export actions */}
          {receipts.length > 0 && (
            <div className="export-actions">
              <button
                className="export-btn"
                onClick={() => printReport(receipts, settings, from, to)}
              >
                🖨 Печать / PDF
              </button>
              <button
                className="export-btn"
                onClick={() => exportCSV(receipts, from, to)}
              >
                📊 Скачать CSV
              </button>
            </div>
          )}

          {/* Receipts list */}
          {receipts.length > 0 ? (
            <div className="list-section">
              <div className="list-header">
                Чеки за период · {formatDate(from)} — {formatDate(to)}
              </div>
              {receipts.map((r) => (
                <button
                  key={r.id}
                  className="receipt-row"
                  onClick={() => onViewReceipt(r.id)}
                >
                  <div className="receipt-row-num">#{r.receiptNumber}</div>
                  <div className="receipt-row-body">
                    <div className="receipt-row-client">{r.clientName}</div>
                    {(r.docType === 'storno' || r.status === 'cancelled') && (
                      <div className="receipt-row-badges">
                        {r.docType === 'storno' && <span className="row-badge row-badge-storno">Возврат</span>}
                        {r.status === 'cancelled' && <span className="row-badge row-badge-cancelled">Аннулирована</span>}
                      </div>
                    )}
                    <div className="receipt-row-date">
                      {formatDate(r.date)} · {PAYMENT_RU[r.paymentMethod]}
                    </div>
                  </div>
                  <div className={`receipt-row-amount ${r.status === 'cancelled' ? 'row-amount-cancelled' : ''} ${r.totalAmount < 0 ? 'row-amount-negative' : ''}`}>
                    {formatCurrency(r.totalAmount)}
                  </div>
                  <div className="receipt-chevron">›</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <div className="empty-title">Нет чеков за период</div>
              <div className="empty-sub">
                {formatDate(from)} — {formatDate(to)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
