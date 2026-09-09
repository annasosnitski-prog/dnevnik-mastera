import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSupabaseRemote } from '../.test-dist/src/sync/supabaseRemote.js';

// Найдено проверкой перед мерджем на реальном телефоне: 337 файлов в
// библиотеке, первый синк частично прошёл, повтор упал на КАЖДОМ снимке,
// который уже успел уехать. Имя файла в Storage — sha256 его содержимого
// (photoRefs.ts), поэтому «уже есть такой файл» не ошибка, а штатный,
// самый частый исход повторной попытки — набор uploaded в syncEngine.ts
// общий только на один прогон синка, и при следующем прогоне тот же
// снимок пробуют залить снова.
//
// Раньше это ловили по upsert:false и тексту ошибки («exists»/«duplicate»).
// На реальном Supabase конфликт иногда приходит сырой ошибкой Postgres
// под HTTP 400, а не ожидаемым 409, и с текстом, который проверка не
// поймала, — один непойманный случай ронял весь синк.

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

// Свой storage-клиент, без сети: FileReader (нужен download/blobToDataUrl)
// в Node недоступен, поэтому эти тесты — только про upload.
function fakeClient({ uploadError, ownerId = 'owner-1' } = {}) {
  const uploads = [];
  return {
    uploads,
    auth: {
      async getSession() {
        return { data: { session: { user: { id: ownerId } } } };
      },
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, blob, options) {
            uploads.push({ bucket, path, options });
            return uploadError ? { error: uploadError } : { error: null };
          },
        };
      },
    },
  };
}

test('повторная загрузка уже лежащего файла не считается ошибкой — upsert:true, а не текст ошибки', async () => {
  const client = fakeClient();
  const remote = await createSupabaseRemote(client);
  await remote.photos.upload('abc123', 'data:image/jpeg;base64,AAAA');

  assert.equal(client.uploads.length, 1);
  assert.equal(client.uploads[0].bucket, 'sync-photos');
  assert.equal(client.uploads[0].path, 'owner-1/abc123');
  assert.equal(client.uploads[0].options.upsert, true);
});

test('настоящая ошибка загрузки (не про повтор) по-прежнему валит синк, а не проглатывается', async () => {
  // Storage-клиент возвращает {error} обычным объектом, не Error — assert.rejects
  // с RegExp сверяет String(reason), а у голого объекта это «[object Object]»,
  // поэтому проверяем message напрямую.
  const client = fakeClient({ uploadError: { message: 'network unreachable', statusCode: '0' } });
  const remote = await createSupabaseRemote(client);
  await assert.rejects(
    () => remote.photos.upload('abc123', 'data:image/jpeg;base64,AAAA'),
    (err) => err.message === 'network unreachable',
  );
});

test('код больше не гадает по тексту ошибки Storage — исход решает upsert', () => {
  // Тот самый непойманный случай, который уронил синк на реальном
  // телефоне: raw-ошибка Postgres под HTTP 400 вместо ожидаемого 409.
  // upsert:true делает эту ветку не нужной вообще, а не точнее.
  const source = readSource('../src/sync/supabaseRemote.ts');
  assert.match(source, /upload\(pathOf\(hash\), blob, \{ contentType: blob\.type, upsert: true \}\)/);
  assert.doesNotMatch(source, /message\.includes\('exists'\)/);
  assert.doesNotMatch(source, /message\.includes\('duplicate'\)/);
});
