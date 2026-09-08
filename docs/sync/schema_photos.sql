-- ============================================================
-- ФАЙЛЫ СНИМКОВ — Шаг 6 синка (docs/SYNC_PLAN.md).
--
-- Выполнить в Supabase → SQL Editor ОДИН раз, после schema.sql.
--
-- Зачем отдельно от таблиц: фото — base64-строки внутри записей, и в
-- Postgres jsonb они уложили бы всю фотобиблиотеку в базу (бесплатный
-- тариф — 500 МБ), причём каждый снимок столько раз, сколько у него
-- копий. В Storage (1 ГБ) снимок лежит файлом, а имя файла — sha256 его
-- содержимого, поэтому копии схлопываются в один файл сами собой.
--
-- Путь файла: <owner_id>/<sha256>. Первый сегмент пути — владелец, и
-- правила ниже разрешают трогать только свою папку.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('sync-photos', 'sync-photos', false)
on conflict (id) do nothing;

-- Читать, класть и удалять — только в своей папке. Публичного доступа нет:
-- ссылка на файл без входа в аккаунт ничего не даст.
create policy "sync photos: read own"
  on storage.objects for select
  using (bucket_id = 'sync-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "sync photos: write own"
  on storage.objects for insert
  with check (bucket_id = 'sync-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "sync photos: delete own"
  on storage.objects for delete
  using (bucket_id = 'sync-photos' and (storage.foldername(name))[1] = auth.uid()::text);
