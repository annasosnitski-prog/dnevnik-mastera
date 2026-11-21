import { Receipt, BusinessSettings } from '../db/types';
import { formatDate, formatCurrency } from '../utils/formatting';

interface Props {
  receipts: Receipt[];
  settings: BusinessSettings;
  onNewReceipt: () => void;
  onViewReceipt: (id: string) => void;
}

export function MainScreen({ receipts, settings, onNewReceipt, onViewReceipt }: Props) {
  const year = settings.currentYear;
  const yearReceipts = receipts.filter((r) => r.year === year);
  const received = yearReceipts.reduce((s, r) => s + r.totalAmount, 0);
  const limit = settings.annualIncomeLimit;
  const remaining = limit - received;
  const pct = limit > 0 ? Math.min(100, Math.round((received / limit) * 100)) : 0;
  const over = received > limit;

  const needsSetup = !settings.ownerName || !settings.oseqNumber;

  return (
    <div className="screen">
      {/* Setup warning */}
      {needsSetup && (
        <div className="setup-banner">
          ⚠️ Заполните данные бизнеса в настройках
        </div>
      )}

      {/* Year income card */}
      <div className="summary-card">
        <div className="summary-year-label">{year} год</div>

        <div className="summary-row">
          <div className="summary-item">
            <div className="summary-label">Получено</div>
            <div className={`summary-amount ${over ? 'danger' : ''}`}>
              {formatCurrency(received)}
            </div>
          </div>
          <div className="summary-divider" />
          <div className="summary-item">
            <div className="summary-label">Лимит</div>
            <div className="summary-amount">{formatCurrency(limit)}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="progress-track">
          <div
            className={`progress-fill ${over ? 'fill-danger' : pct >= 80 ? 'fill-warn' : 'fill-ok'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className={`remaining-text ${over ? 'danger' : ''}`}>
          {over
            ? `⚠️ Превышение: ${formatCurrency(Math.abs(remaining))}`
            : `Осталось ${formatCurrency(remaining)} · ${pct}%`}
        </div>
      </div>

      {/* New receipt CTA */}
      <button className="btn-new-receipt" onClick={onNewReceipt}>
        <span className="btn-new-plus">+</span> Новая кабала
      </button>

      {/* Receipt list */}
      {receipts.length > 0 ? (
        <div className="list-section">
          <div className="list-header">История</div>
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
                <div className="receipt-row-date">{formatDate(r.date)}</div>
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
          <div className="empty-icon">📄</div>
          <div className="empty-title">Кабалот нет</div>
          <div className="empty-sub">Нажмите «Новая кабала» чтобы начать</div>
        </div>
      )}
    </div>
  );
}
