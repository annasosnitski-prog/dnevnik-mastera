-- ============================================================
-- СХЕМА СИНКА — Шаг 4 синка (docs/SYNC_PLAN.md).
--
-- Выполнить ОДИН РАЗ в Supabase: Dashboard → SQL Editor → New query →
-- вставить целиком → Run. Скрипт идемпотентен (IF NOT EXISTS всюду),
-- повторный запуск ничего не ломает.
--
-- Одна пара таблиц на каждый стор IndexedDB (clients/projects/
-- contentEntries/masterInfo) + одна общая на следы удалений. Владелец
-- строки — owner_id = auth.uid(): это тот самый общий код, превращённый
-- в учётную запись Supabase Auth (см. src/lib/syncIdentity.ts,
-- src/lib/syncAuth.ts). RLS — единственная граница безопасности:
-- publishable-ключ в src/lib/supabaseConfig.ts публичный по замыслу,
-- без RLS кто угодно с этим ключом читал бы чужие дневники.
-- ============================================================

create table if not exists public.sync_clients (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null,
  primary key (owner_id, id)
);

create table if not exists public.sync_projects (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null,
  primary key (owner_id, id)
);

create table if not exists public.sync_content_entries (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null,
  primary key (owner_id, id)
);

-- Одна запись на владельца — как и в самом дневнике (masterInfoRepo.ts).
create table if not exists public.sync_master_info (
  owner_id uuid not null references auth.users(id) on delete cascade primary key,
  data jsonb not null,
  updated_at timestamptz not null
);

-- store — из какого стора запись ('clients' | 'projects' | 'contentEntries'),
-- как в src/storage/repos/tombstonesRepo.ts.
create table if not exists public.sync_deletions (
  owner_id uuid not null references auth.users(id) on delete cascade,
  store text not null,
  id text not null,
  deleted_at timestamptz not null,
  primary key (owner_id, store, id)
);

alter table public.sync_clients enable row level security;
alter table public.sync_projects enable row level security;
alter table public.sync_content_entries enable row level security;
alter table public.sync_master_info enable row level security;
alter table public.sync_deletions enable row level security;

-- Одна и та же политика на каждую таблицу: видеть и писать можно только
-- свои строки (owner_id = auth.uid()). drop + create, а не
-- "if not exists" — Postgres не умеет CREATE POLICY IF NOT EXISTS.
do $$
declare
  t text;
begin
  foreach t in array array['sync_clients', 'sync_projects', 'sync_content_entries', 'sync_master_info', 'sync_deletions']
  loop
    execute format('drop policy if exists owner_only on public.%I', t);
    execute format(
      'create policy owner_only on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t
    );
  end loop;
end $$;
