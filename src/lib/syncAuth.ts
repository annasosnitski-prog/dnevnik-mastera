// ============================================================
// ВХОД В СИНК — Шаг 4 синка (docs/SYNC_PLAN.md).
//
// Первое устройство, привязанное кодом, СОЗДАЁТ учётную запись в
// Supabase Auth (под псевдо-почтой и паролем, см. syncIdentity.ts);
// каждое следующее устройство с тем же кодом в неё просто ВХОДИТ — для
// мастера это одно и то же действие «ввести код», разница скрыта здесь.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveSyncIdentity } from './syncIdentity.js';

export type PairResult =
  | { ok: true; created: boolean }
  | { ok: false; reason: 'weak-password' | 'network' | 'unknown'; message: string };

export async function pairDeviceWithCode(client: SupabaseClient, code: string): Promise<PairResult> {
  const identity = await deriveSyncIdentity(code);

  const signIn = await client.auth.signInWithPassword(identity);
  if (!signIn.error) return { ok: true, created: false };

  // «Invalid login credentials» покрывает и «такой почты ещё нет» (первое
  // устройство), и «пароль не совпал» — с производным паролем второе
  // невозможно при том же коде, так что для нас это всегда «регистрируем».
  const signUp = await client.auth.signUp(identity);
  if (!signUp.error) return { ok: true, created: true };

  if (signUp.error.message.toLowerCase().includes('password')) {
    return { ok: false, reason: 'weak-password', message: signUp.error.message };
  }
  if (signUp.error.status === undefined || signUp.error.status >= 500 || signUp.error.status === 0) {
    return { ok: false, reason: 'network', message: signUp.error.message };
  }
  return { ok: false, reason: 'unknown', message: signUp.error.message };
}

export async function unpairDevice(client: SupabaseClient): Promise<void> {
  await client.auth.signOut();
}

export async function isPaired(client: SupabaseClient): Promise<boolean> {
  const { data } = await client.auth.getSession();
  return data.session !== null;
}
