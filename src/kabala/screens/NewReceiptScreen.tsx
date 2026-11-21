import { useState } from 'react';
import { ReceiptFormData, BusinessSettings, Receipt } from '../db/types';
import { todayStr, formatCurrency, PAYMENT_OPTIONS } from '../utils/formatting';
import { validateReceiptForm } from '../utils/validation';

interface Props {
  settings: BusinessSettings;
  lastReceipt: Receipt | undefined;
  onIssue: (form: ReceiptFormData) => Promise<Receipt>;
  onBack: () => void;
  onViewAfterIssue: (id: string) => void;
}

export function NewReceiptScreen({ settings, lastReceipt, onIssue, onBack, onViewAfterIssue }: Props) {
  const today = todayStr();
  const minDate = lastReceipt ? lastReceipt.date : undefined;

  const [form, setForm] = useState<ReceiptFormData>({
    date: today,
    clientName: '',
    description: '',
    quantity: 1,
    unitPrice: 0,
    paymentMethod: 'cash',
    note: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [issuing, setIssuing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const totalAmount = Math.round(form.quantity * form.unitPrice * 100) / 100;

  function set<K extends keyof ReceiptFormData>(key: K, value: ReceiptFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function handleSubmitClick() {
    const errs = validateReceiptForm(
      form.date,
      form.clientName,
      form.description,
      form.unitPrice,
      lastReceipt?.date ?? null
    );
    if (Object.keys(errs).length) {
      setErrors(errs);
      // scroll to first error
      const firstKey = Object.keys(errs)[0];
      document.getElementById(`field-${firstKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    setIssuing(true);
    try {
      const receipt = await onIssue(form);
      setConfirmOpen(false);
      // Ask if user wants to print immediately
      onViewAfterIssue(receipt.id);
    } catch (e) {
      alert('Ошибка при сохранении: ' + (e as Error).message);
    } finally {
      setIssuing(false);
    }
  }

  return (
    <div className="screen screen-form">
      <div className="form-header">
        <button className="back-btn" onClick={onBack}>‹ Назад</button>
        <div className="form-title">
          Кабала #{settings.nextReceiptNumber}
        </div>
      </div>

      <div className="form-body">
        {/* Date */}
        <div className="field-group" id="field-date">
          <label className="field-label">Дата</label>
          <input
            className={`field-input ${errors.date ? 'field-error' : ''}`}
            type="date"
            value={form.date}
            min={minDate}
            max={today}
            onChange={(e) => set('date', e.target.value)}
          />
          {errors.date && <div className="error-msg">{errors.date}</div>}
        </div>

        {/* Client */}
        <div className="field-group" id="field-clientName">
          <label className="field-label">Клиент</label>
          <input
            className={`field-input ${errors.clientName ? 'field-error' : ''}`}
            type="text"
            placeholder="Имя клиента"
            value={form.clientName}
            onChange={(e) => set('clientName', e.target.value)}
            autoComplete="off"
          />
          {errors.clientName && <div className="error-msg">{errors.clientName}</div>}
        </div>

        {/* Description */}
        <div className="field-group" id="field-description">
          <label className="field-label">Описание услуги</label>
          <textarea
            className={`field-input field-textarea ${errors.description ? 'field-error' : ''}`}
            placeholder="Tattoo session / Тату / שירות..."
            value={form.description}
            rows={2}
            onChange={(e) => set('description', e.target.value)}
          />
          {errors.description && <div className="error-msg">{errors.description}</div>}
        </div>

        {/* Qty + Price */}
        <div className="field-row-2">
          <div className="field-group" id="field-quantity">
            <label className="field-label">Кол-во</label>
            <input
              className="field-input"
              type="number"
              min="1"
              step="1"
              value={form.quantity}
              onChange={(e) => set('quantity', Math.max(1, parseFloat(e.target.value) || 1))}
              inputMode="decimal"
            />
          </div>
          <div className="field-group" id="field-unitPrice">
            <label className="field-label">Цена (₪)</label>
            <input
              className={`field-input ${errors.unitPrice ? 'field-error' : ''}`}
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={form.unitPrice || ''}
              onChange={(e) => set('unitPrice', parseFloat(e.target.value) || 0)}
              inputMode="decimal"
            />
            {errors.unitPrice && <div className="error-msg">{errors.unitPrice}</div>}
          </div>
        </div>

        {/* Total */}
        <div className="total-preview">
          <span className="total-label">Итого</span>
          <span className="total-value">{formatCurrency(totalAmount)}</span>
        </div>

        {/* Payment method */}
        <div className="field-group">
          <label className="field-label">Способ оплаты</label>
          <select
            className="field-input field-select"
            value={form.paymentMethod}
            onChange={(e) => set('paymentMethod', e.target.value as ReceiptFormData['paymentMethod'])}
          >
            {PAYMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Note */}
        <div className="field-group">
          <label className="field-label">Примечание <span className="field-optional">(необязательно)</span></label>
          <input
            className="field-input"
            type="text"
            placeholder="..."
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
          />
        </div>

        {/* Submit */}
        <button className="btn-issue" onClick={handleSubmitClick} disabled={issuing}>
          Выпустить кабалу
        </button>
      </div>

      {/* Confirm dialog */}
      {confirmOpen && (
        <div className="modal-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Выпустить кабалу #{settings.nextReceiptNumber}?</div>
            <div className="modal-body">
              <div className="modal-row"><span>Клиент</span><strong>{form.clientName}</strong></div>
              <div className="modal-row"><span>Сумма</span><strong>{formatCurrency(totalAmount)}</strong></div>
              <div className="modal-row"><span>Дата</span><strong>{form.date.split('-').reverse().join('.')}</strong></div>
            </div>
            <div className="modal-note">После выпуска номер и дату нельзя изменить</div>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setConfirmOpen(false)}>Отмена</button>
              <button className="modal-confirm" onClick={handleConfirm} disabled={issuing}>
                {issuing ? 'Сохранение...' : 'Выпустить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
