import { dbExport, dbImport } from '../db/db';

export async function downloadBackup(): Promise<void> {
  const data = await dbExport();
  const json = JSON.stringify(data, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `kabala-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importBackup(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data || (typeof data !== 'object')) throw new Error('bad format');
        await dbImport(data);
        resolve();
      } catch {
        reject(new Error('Файл повреждён или имеет неверный формат'));
      }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsText(file);
  });
}
