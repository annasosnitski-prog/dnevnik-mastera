// ============================================================
// КЛИЕНТ SUPABASE — Шаг 4 синка (docs/SYNC_PLAN.md).
//
// Один экземпляр на вкладку, лениво: подключаться к облаку, пока мастер
// ни разу не открыла синк, незачем.
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabaseConfig';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        // Свой ключ в localStorage — не тот, что использует остальной
        // дневник, чтобы не пересекаться с другими данными приложения.
        storageKey: 'inka-sync-auth',
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}
