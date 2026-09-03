import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Фото лежат base64-строками ВНУТРИ записей (Session/Project/ContentEntry
// .photos), поэтому getAll по стору поднимает в память всю фотобиблиотеку
// мастера целиком. Пока такое чтение стояло после КАЖДОЙ записи, «сохранить
// одну заметку» означало: старая копия библиотеки в состоянии + новая
// прочитанная + буфер распаковки. На iPhone это тот самый момент, когда
// браузер закрывает соединение — и чем больше клиентов, сессий и контента,
// тем чаще.
//
// Эти тесты держат границу: полное чтение только там, где действительно
// изменилось всё, а обычная запись обновляет состояние тем, что сама же
// положила.

const app = readFileSync(new URL('../src/components/TattoDiary.tsx', import.meta.url), 'utf8');

// Комментарии выбрасываем: эти тесты запрещают ВЫЗОВЫ, а вокруг них стоят
// объяснения, которые те же вызовы называют по имени («здесь был getAll по
// всему стору, и вот почему его нет»). Без вычистки тест падал бы на прозе,
// объясняющей его же смысл.
function stripLineComments(text) {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

function slice(from, to) {
  const start = app.indexOf(from);
  const end = app.indexOf(to, start + from.length);
  assert.ok(start !== -1, `не найдено начало: ${from}`);
  assert.ok(end !== -1, `не найден конец: ${to}`);
  return stripLineComments(app.slice(start, end));
}

// ── Обычная запись не перечитывает склад ─────────────────────────────────

test('saving projects updates state from what it wrote, not from a full store read', () => {
  const write = slice('const writeProjects = (', 'const saveProject = (project: Project) => {');
  assert.doesNotMatch(write, /loadProjects\(/);
  assert.match(write, /setProjects\(saved\.map\(normalizeProject\)\)/);
});

test('deleting a project drops it from state instead of re-reading every other one', () => {
  const del = slice('const deleteProject = (id: string) => {', '// ── Перенос записей клиента на проекты');
  assert.doesNotMatch(del, /loadProjects\(/);
  assert.match(del, /setProjects\(\(current\) => current\.filter\(\(p\) => p\.id !== id\)\)/);
});

test('saving a client upserts the written record instead of re-reading all clients', () => {
  const save = slice('const saveClient = (client: Client) => {', 'const deleteClient = (id: string) => {');
  assert.doesNotMatch(save, /loadClients\(/);
  assert.match(save, /setStoredClients\(\(current\) => \{/);
  // Апсерт, а не просто map: новый клиент иначе не появился бы в списке.
  assert.match(save, /const at = current\.findIndex\(\(c\) => c\.id === record\.id\)/);
  assert.match(save, /at === -1 \? \[\.\.\.current, shown\] :/);
});

test('deleting a client drops it from state instead of re-reading the rest', () => {
  const del = slice('const deleteClient = (id: string) => {', '// Импорт полного бэкапа');
  assert.doesNotMatch(del, /loadClients\(/);
  assert.match(del, /setStoredClients\(\(current\) => current\.filter\(\(c\) => c\.id !== id\)\)/);
});

test('a successful content write does not re-read the store that holds duplicate photos', () => {
  const save = slice('const saveContentEntry = (entry: ContentEntry) => {', 'const deleteContentEntry = (id: string) => {');
  // Состояние уже выставлено этим же entry до записи.
  assert.match(save, /setContentEntries\(\(current\) => \[shown,/);
  assert.match(save, /tx\.onerror = \(\) => \{/);
  // Ровно одно чтение — и оно в ветке ошибки, а не успеха.
  assert.equal((save.match(/loadContentEntries\(/g) ?? []).length, 1);
  assert.ok(save.indexOf('loadContentEntries(') > save.indexOf('tx.onerror'));
});

test('deleting a content entry drops it from state instead of re-reading the store', () => {
  const del = slice('const deleteContentEntry = (id: string) => {', 'useEffect(() => {');
  assert.doesNotMatch(del, /loadContentEntries\(/);
  assert.match(del, /setContentEntries\(\(current\) => current\.filter\(\(entry\) => entry\.id !== id\)\)/);
});

// ── Форма записи в состоянии не должна разойтись с базой ─────────────────
//
// Самое тонкое место правки. Раньше состояние ВСЕГДА приходило через
// нормализацию (loadClients/loadProjects/loadContentEntries её применяли к
// каждой прочитанной записи). Если теперь ставить в состояние сырой объект,
// запись, показанная сразу после сохранения, отличалась бы формой от неё же
// после перезапуска — и это разошлось бы молча, всплыв когда-нибудь потом в
// селекторе, который рассчитывает на заполненное поле.

test('an in-place project update goes through the same normalization a read did', () => {
  const write = slice('const writeProjects = (', 'const saveProject = (project: Project) => {');
  assert.match(write, /normalizeProject/);
});

test('an in-place client update normalizes, and keeps the list position that ids depend on', () => {
  const save = slice('const saveClient = (client: Client) => {', 'const deleteClient = (id: string) => {');
  // normalizeClient(raw, index) — второй аргумент при чтении давал .map().
  assert.match(save, /normalizeClient\(record, at === -1 \? current\.length : at\)/);
});

test('an in-place content update normalizes exactly as the read did — both passes', () => {
  const save = slice('const saveContentEntry = (entry: ContentEntry) => {', 'const deleteContentEntry = (id: string) => {');
  assert.match(save, /normalizeContentEntryLink\(normalizeContentEntry\(entry\)\)/);
});

test('the legacy client arrays are normalized only for display, never rewritten in storage', () => {
  // Легаси sessions/consultations — страховка после переезда записей на
  // проекты. В базу по-прежнему ложится `record` как есть.
  const save = slice('const saveClient = (client: Client) => {', 'const deleteClient = (id: string) => {');
  assert.match(save, /tx\.objectStore\('clients'\)\.put\(record\)/);
  assert.doesNotMatch(save, /put\(shown\)/);
  assert.doesNotMatch(save, /put\(normalizeClient/);
});

// ── Но состояние обязано сходиться с базой ───────────────────────────────

test('a failed content write DOES re-read — state ran ahead of the database', () => {
  // Единственный случай, где чтение обязательно: черновик показан мастеру,
  // но в базу не лёг, и она должна видеть правду.
  const save = slice('const saveContentEntry = (entry: ContentEntry) => {', 'const deleteContentEntry = (id: string) => {');
  const onerror = save.slice(save.indexOf('tx.onerror'));
  assert.match(onerror, /loadContentEntries\(database\)/);
});

test('full reads stay where everything really changed: connect, import, migration, restore', () => {
  // Подключение к базе — состояние пустое, читать обязательно.
  const connect = slice('const connectDb = (', 'const scheduleReconnect');
  assert.match(connect, /loadClients\(database\)/);
  assert.match(connect, /loadProjects\(database\)/);
  assert.match(connect, /loadContentEntries\(database\)/);

  // Восстановление из копии и импорт переписывают всё сразу.
  const restore = slice('const restoreFullBackup = async (', 'const writeProjects = (');
  assert.match(restore, /loadClients\(db\)/);
  assert.match(restore, /loadProjects\(db\)/);

  // Разовый перенос записей клиента на проекты правит все проекты сразу.
  const migration = slice('// ── Перенос записей клиента на проекты', 'const loadContentEntries');
  assert.match(migration, /loadProjects\(db\)/);
});

test('project writes still bump lastMeaningfulActivityAt in what lands in state', () => {
  // Раньше это значение приходило обратно чтением из базы. Теперь состояние
  // ставится из `written` — значит бамп обязан быть именно там, иначе на
  // экране осталось бы прежнее «последнее движение» до перезапуска.
  const write = slice('const writeProjects = (', 'const saveProject = (project: Project) => {');
  assert.match(write, /lastMeaningfulActivityAt: new Date\(\)\.toISOString\(\)/);
  assert.match(write, /const writtenById = new Map\(written\.map\(\(p\) => \[p\.id, p\]\)\)/);
  assert.match(write, /const saved = nextProjects\.map\(\(p\) => writtenById\.get\(p\.id\) \?\? p\)/);
});
