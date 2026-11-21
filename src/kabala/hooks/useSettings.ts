import { useState, useEffect, useCallback } from 'react';
import { BusinessSettings, DEFAULT_SETTINGS } from '../db/types';
import { dbGetSettings, dbSaveSettings } from '../db/db';

export function useSettings() {
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const s = await dbGetSettings();
      setSettings(s ?? DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateSettings = useCallback(
    async (updates: Partial<BusinessSettings>): Promise<void> => {
      const next: BusinessSettings = { ...settings, ...updates };
      await dbSaveSettings(next);
      setSettings(next);
    },
    [settings]
  );

  return { settings, loading, updateSettings, reload: load };
}
