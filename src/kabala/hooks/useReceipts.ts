import { useState, useEffect, useCallback } from 'react';
import { Receipt, ReceiptFormData, BusinessSettings } from '../db/types';
import { dbGetAllReceipts, dbSaveReceipt, dbGetLastReceipt, dbSaveSettings } from '../db/db';

export function useReceipts() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [lastReceipt, setLastReceipt] = useState<Receipt | undefined>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [all, last] = await Promise.all([dbGetAllReceipts(), dbGetLastReceipt()]);
      setReceipts(all);
      setLastReceipt(last);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const issueReceipt = useCallback(
    async (form: ReceiptFormData, settings: BusinessSettings): Promise<Receipt> => {
      const receipt: Receipt = {
        id: crypto.randomUUID(),
        receiptNumber: settings.nextReceiptNumber,
        date: form.date,
        clientName: form.clientName.trim(),
        description: form.description.trim(),
        quantity: form.quantity,
        unitPrice: form.unitPrice,
        totalAmount: Math.round(form.quantity * form.unitPrice * 100) / 100,
        paymentMethod: form.paymentMethod,
        note: form.note.trim() || undefined,
        status: 'saved',
        docType: 'receipt',
        createdAt: new Date().toISOString(),
        year: parseInt(form.date.split('-')[0]),
      };

      await dbSaveReceipt(receipt);
      await dbSaveSettings({ ...settings, nextReceiptNumber: settings.nextReceiptNumber + 1 });
      await load();
      return receipt;
    },
    [load]
  );

  // Refund: never edit or delete an issued receipt (numbering must stay
  // sequential and gap-free). Instead issue a linked storno document with
  // a negative amount, and mark the original as cancelled.
  const stornoReceipt = useCallback(
    async (original: Receipt, settings: BusinessSettings, date: string): Promise<Receipt> => {
      if (original.docType === 'storno') {
        throw new Error('Нельзя оформить возврат на сторно-документ');
      }
      if (original.status === 'cancelled') {
        throw new Error('Кабала уже аннулирована');
      }

      const storno: Receipt = {
        id: crypto.randomUUID(),
        receiptNumber: settings.nextReceiptNumber,
        date,
        clientName: original.clientName,
        description: `Возврат по кабале №${original.receiptNumber}: ${original.description}`,
        quantity: original.quantity,
        unitPrice: -original.unitPrice,
        totalAmount: -original.totalAmount,
        paymentMethod: original.paymentMethod,
        note: original.note,
        status: 'saved',
        docType: 'storno',
        relatedReceiptId: original.id,
        relatedReceiptNumber: original.receiptNumber,
        createdAt: new Date().toISOString(),
        year: parseInt(date.split('-')[0]),
      };

      const cancelledOriginal: Receipt = {
        ...original,
        status: 'cancelled',
        relatedReceiptId: storno.id,
        relatedReceiptNumber: storno.receiptNumber,
      };

      await dbSaveReceipt(storno);
      await dbSaveReceipt(cancelledOriginal);
      await dbSaveSettings({ ...settings, nextReceiptNumber: settings.nextReceiptNumber + 1 });
      await load();
      return storno;
    },
    [load]
  );

  return { receipts, lastReceipt, loading, issueReceipt, stornoReceipt, reload: load };
}
