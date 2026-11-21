import { useEffect, useState } from 'react';
import { Receipt, BusinessSettings } from '../db/types';
import { dbGetReceipt } from '../db/db';
import { formatDate, formatCurrency, todayStr, PAYMENT_RU } from '../utils/formatting';
import { validateDate } from '../utils/validation';
import { printReceipt, shareReceipt } from '../utils/pdfPrint';

interface Props {
  receiptId: string;
  settings: BusinessSettings;
  onBack: () => void;
  onStorno: (original: Receipt, date: string) => Promise<Receipt>;
  onViewAfterStorno: (id: string) => void;
}

export function ReceiptViewScreen({ receiptId, settings, onBack, onStorno, onViewAfterStorno }: Props) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const [stornoOpen, setStornoOpen] = useState(false);
  const [stornoDate, setStornoDate] = useState(todayStr());
  const [stornoError, setStornoError] = useState<string | null>(null);
  const [stornoing, setStornoing] = useState(false);

  useEffect(() => {
    dbGetReceipt(receiptId).then((r) => {
      setReceipt(r ?? null);
      setLoading(false);
    });
  }, [receiptId]);

  if (loading) {
    return (
      <div className="screen screen-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="screen screen-center">
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <div>Кабала не найдена</div>
          <button className="btn-back-small" onClick={onBack}>Назад</button>
        </div>
      </div>
    );
  }

  async function handleShare() {
    if (!receipt) return;
    setSharing(true);
    try {
      await shareReceipt(receipt, settings);
    } finally {
      setSharing(false);
    }
  }

  function openStorno() {
    setStornoDate(todayStr());
    setStornoError(null);
    setStornoOpen(true);
  }

  async function handleStornoConfirm() {
    if (!receipt) return;
    const dateErr = validateDate(stornoDate, receipt.date);
    if (dateErr) {
      setStornoError(dateErr);
      return;
    }
    setStornoing(true);
    try {
      const storno = await onStorno(receipt, stornoDate);
      setStornoOpen(false);
      onViewAfterStorno(storno.id);
    } catch (e) {
      setStornoError((e as Error).message);
    } finally {
      setStornoing(false);
    }
  }

  const isStorno = receipt.docType === 'storno';
  const isCancelled = receipt.status === 'cancelled';
  const canRefund = !isStorno && !isCancelled;

  return (
    <div className="screen">
      <div className="form-header">
        <button className="back-btn" onClick={onBack}>‹ Назад</button>
        <div className="form-title">
          {isStorno ? 'Возврат' : 'Кабала'} #{receipt.receiptNumber}
        </div>
      </div>

      {/* Receipt card */}
      <div className="view-card">
        {/* Header stamp */}
        <div className="view-stamp">
          <div className="view-he-title">{isStorno ? 'זיכוי' : 'קבלה'}</div>
          <div className="view-num">№ {receipt.receiptNumber}</div>
          <div className="view-date">{formatDate(receipt.date)}</div>
        </div>

        {isStorno && (
          <div className="view-status-badge view-status-storno">
            Возврат по кабале №{receipt.relatedReceiptNumber}
          </div>
        )}
        {isCancelled && (
          <div className="view-status-badge view-status-cancelled">
            Аннулирована возвратом №{receipt.relatedReceiptNumber}
          </div>
        )}

        {/* Business info */}
        <div className="view-biz">
          <div className="view-biz-name">{settings.ownerName}</div>
          <div className="view-biz-sub">עוסק פטור · מס' {settings.oseqNumber}</div>
        </div>

        <div className="view-divider" />

        {/* Client */}
        <div className="view-field">
          <div className="view-field-label">Клиент / לקוח</div>
          <div className="view-field-value large">{receipt.clientName}</div>
        </div>

        <div className="view-divider" />

        {/* Details */}
        <div className="view-field">
          <div className="view-field-label">Услуга / שירות</div>
          <div className="view-field-value">{receipt.description}</div>
        </div>
        <div className="view-field-row">
          <div className="view-field half">
            <div className="view-field-label">Кол-во / כמות</div>
            <div className="view-field-value">{receipt.quantity}</div>
          </div>
          <div className="view-field half">
            <div className="view-field-label">Цена за ед. / מחיר</div>
            <div className="view-field-value">{formatCurrency(receipt.unitPrice)}</div>
          </div>
        </div>

        <div className="view-divider" />

        {/* Total */}
        <div className="view-total-row">
          <span>Итого / סה"כ</span>
          <span className="view-total-amount">{formatCurrency(receipt.totalAmount)}</span>
        </div>

        <div className="view-divider" />

        {/* Payment */}
        <div className="view-field">
          <div className="view-field-label">Оплата / תשלום</div>
          <div className="view-payment-badge">{PAYMENT_RU[receipt.paymentMethod]}</div>
        </div>

        {/* Note */}
        {receipt.note && (
          <>
            <div className="view-divider" />
            <div className="view-field">
              <div className="view-field-label">Примечание / הערה</div>
              <div className="view-field-value view-note">{receipt.note}</div>
            </div>
          </>
        )}

        {/* Legal footer */}
        <div className="view-legal">עוסק פטור — לא נגבה מע״מ</div>
      </div>

      {/* Actions */}
      <div className="view-actions">
        <button
          className="action-btn"
          onClick={handleShare}
          disabled={sharing}
        >
          <span className="action-icon">↑</span>
          {sharing ? 'Загрузка...' : 'Поделиться'}
        </button>
        <button
          className="action-btn"
          onClick={() => printReceipt(receipt, settings)}
        >
          <span className="action-icon">🖨</span>
          Печать / PDF
        </button>
      </div>

      {canRefund && (
        <button className="action-btn-danger-full" onClick={openStorno}>
          <span className="action-icon">↩</span>
          Оформить возврат
        </button>
      )}

      {/* Storno confirm dialog */}
      {stornoOpen && (
        <div className="modal-overlay" onClick={() => !stornoing && setStornoOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Оформить возврат по кабале #{receipt.receiptNumber}?</div>
            <div className="modal-body">
              <div className="modal-row"><span>Клиент</span><strong>{receipt.clientName}</strong></div>
              <div className="modal-row"><span>Сумма возврата</span><strong>{formatCurrency(receipt.totalAmount)}</strong></div>
              <div className="field-group">
                <label className="field-label">Дата возврата</label>
                <input
                  className={`field-input ${stornoError ? 'field-error' : ''}`}
                  type="date"
                  value={stornoDate}
                  min={receipt.date}
                  max={todayStr()}
                  onChange={(e) => { setStornoDate(e.target.value); setStornoError(null); }}
                />
                {stornoError && <div className="error-msg">{stornoError}</div>}
              </div>
            </div>
            <div className="modal-note">
              Будет выпущена новая кабала-возврат #{settings.nextReceiptNumber} на сумму {formatCurrency(-receipt.totalAmount)}.
              Исходная кабала останется в истории с пометкой «Аннулирована».
            </div>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setStornoOpen(false)} disabled={stornoing}>Отмена</button>
              <button className="modal-confirm" onClick={handleStornoConfirm} disabled={stornoing}>
                {stornoing ? 'Оформление...' : 'Оформить возврат'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
