-- ============================================================
-- ДОБАВКА К СХЕМЕ — выполнить ПОСЛЕ schema.sql, тоже один раз.
-- Supabase Dashboard → SQL Editor → New query → вставить → Run.
--
-- owner_id получает значение ПО УМОЛЧАНИЮ от auth.uid() — значит,
-- приложение никогда не отправляет его само, и подделать его с клиента
-- невозможно: что бы ни прислали, база берёт владельца из подписанного
-- токена. Идемпотентно, повторный запуск ничего не ломает.
-- ============================================================

alter table public.sync_clients alter column owner_id set default auth.uid();
alter table public.sync_projects alter column owner_id set default auth.uid();
alter table public.sync_content_entries alter column owner_id set default auth.uid();
alter table public.sync_master_info alter column owner_id set default auth.uid();
alter table public.sync_deletions alter column owner_id set default auth.uid();
