import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { BusinessSettings, Receipt } from './types';

interface KabalaDB extends DBSchema {
  settings: {
    key: string;
    value: BusinessSettings;
  };
  receipts: {
    key: string;
    value: Receipt;
    indexes: {
      'by-year': number;
      'by-number': number;
      'by-date': string;
    };
  };
}

let _db: IDBPDatabase<KabalaDB> | null = null;

async function getDB(): Promise<IDBPDatabase<KabalaDB>> {
  if (_db) return _db;
  _db = await openDB<KabalaDB>('kabala-db', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('receipts')) {
        const s = db.createObjectStore('receipts', { keyPath: 'id' });
        s.createIndex('by-year', 'year');
        s.createIndex('by-number', 'receiptNumber');
        s.createIndex('by-date', 'date');
      }
    },
  });
  return _db;
}

// Settings
export async function dbGetSettings(): Promise<BusinessSettings | undefined> {
  const db = await getDB();
  return db.get('settings', 'settings');
}

export async function dbSaveSettings(s: BusinessSettings): Promise<void> {
  const db = await getDB();
  await db.put('settings', s);
}

// Receipts
export async function dbGetAllReceipts(): Promise<Receipt[]> {
  const db = await getDB();
  const all = await db.getAll('receipts');
  return all.sort((a, b) => b.receiptNumber - a.receiptNumber);
}

export async function dbSaveReceipt(r: Receipt): Promise<void> {
  const db = await getDB();
  await db.put('receipts', r);
}

export async function dbGetReceipt(id: string): Promise<Receipt | undefined> {
  const db = await getDB();
  return db.get('receipts', id);
}

export async function dbGetReceiptsByDateRange(from: string, to: string): Promise<Receipt[]> {
  const db = await getDB();
  const all = await db.getAll('receipts');
  return all
    .filter((r) => r.date >= from && r.date <= to)
    .sort((a, b) => a.receiptNumber - b.receiptNumber);
}

export async function dbGetLastReceipt(): Promise<Receipt | undefined> {
  const db = await getDB();
  const all = await db.getAll('receipts');
  if (!all.length) return undefined;
  return all.reduce((max, r) => (r.receiptNumber > max.receiptNumber ? r : max));
}

// Backup
export async function dbExport(): Promise<object> {
  const db = await getDB();
  const settings = await db.get('settings', 'settings');
  const receipts = await db.getAll('receipts');
  return { version: 1, exportedAt: new Date().toISOString(), settings, receipts };
}

export async function dbImport(data: {
  settings?: BusinessSettings;
  receipts?: Receipt[];
}): Promise<void> {
  const db = await getDB();
  if (data.settings) {
    await db.put('settings', { ...data.settings, id: 'settings' });
  }
  if (Array.isArray(data.receipts)) {
    const tx = db.transaction('receipts', 'readwrite');
    for (const r of data.receipts) {
      await tx.store.put(r);
    }
    await tx.done;
  }
}
