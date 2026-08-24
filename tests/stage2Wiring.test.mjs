import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Проводка Этапа 2 по исходнику — тем же приёмом, что clientTabGems и
// contentLinkPickerSheet. Всё, что здесь проверяется, ломается ТИХО: ошибки
// в консоли не будет, приложение продолжит работать, просто перестанет
// сохранять/показывать/синхронизировать. Юнит-тестами это не ловится —
// чистые функции остаются правильными, неверна становится их проводка.

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const app = readSource('../src/components/TattoDiary.tsx');

test('«записи клиента» — вычисляемый срез по проектам, а не отдельное хранилище', () => {
  assert.match(app, /const \[storedClients, setStoredClients\] = useState<Client\[\]>\(\[\]\);/);
  assert.match(
    app,
    /const clients = useMemo\(\s*\(\) =>\s*storedClients\.map\(\(c\) => \(\{\s*\.\.\.c,\s*sessions: getClientSessions\(projects, c\.id\),\s*consultations: getClientConsultations\(projects, c\.id\),/,
  );
});

// Ровно тот баг, что был найден при переносе: миграции нужен СЫРОЙ клиент из
// базы. Если подать вычисляемый clients, его sessions собраны из тех же
// проектов — миграция сочтёт каждую запись уже перенесённой и молча не
// сделает ничего, а легаси-записи останутся невидимыми навсегда.
test('миграция читает storedClients (легаси-массивы), а не вычисляемый срез', () => {
  assert.match(app, /migrateClientRecordsIntoProjects\(storedClients, projects\)/);
  assert.doesNotMatch(app, /migrateClientRecordsIntoProjects\(clients,/);
});

test('saveClient не записывает проекцию обратно в карточку клиента', () => {
  const saveClient = app.slice(app.indexOf('const saveClient = (client: Client) => {'), app.indexOf('const deleteClient ='));
  // Легаси-массивы берутся из базы как есть: записать в них проекцию значило
  // бы воскресить дублирующее хранилище, от которого Этап 2 и избавляется.
  assert.match(saveClient, /sessions: stored\?\.sessions \?\? \[\],/);
  assert.match(saveClient, /consultations: stored\?\.consultations \?\? \[\],/);
});

test('запись проектов идёт одной транзакцией — двух конкурирующих сохранений в тике нет', () => {
  const saveProjects = app.slice(app.indexOf('const saveProjects = (nextProjects: Project[]) => {'), app.indexOf('const saveProject = (project: Project) => {'));
  assert.match(saveProjects, /const changed = nextProjects\.filter\(\(p\) => beforeById\.get\(p\.id\) !== p\);/);
  assert.match(saveProjects, /const tx = openWriteTx\('projects'/);
  // Одна транзакция на все изменённые проекты, а не по одной на каждый.
  assert.equal((saveProjects.match(/openWriteTx\(/g) ?? []).length, 1);
  // saveProject остаётся, но как тонкая обёртка над тем же saveProjects.
  const saveProject = app.slice(app.indexOf('const saveProject = (project: Project) => {'), app.indexOf('const deleteProject ='));
  assert.match(saveProject, /saveProjects\(/);
  assert.doesNotMatch(saveProject, /openWriteTx\(/);
});

// Синк календаря раньше висел на saveClient — единственной воронке всех
// изменений. После переезда записей на проекты он обязан стрелять из записи
// проектов, иначе события просто перестанут появляться в Инка-календаре.
test('календарь синхронизируется после записи проектов, а не только клиента', () => {
  const saveProjects = app.slice(app.indexOf('const saveProjects = (nextProjects: Project[]) => {'), app.indexOf('const saveProject = (project: Project) => {'));
  assert.match(saveProjects, /syncCalendarAfterProjectsSave\(projects, nextProjects\.map/);
  const sync = app.slice(app.indexOf('const syncCalendarAfterProjectsSave ='), app.indexOf('// Единственная точка записи в стор проектов.'));
  assert.match(sync, /diffAndSync\(asSyncClient\(before\), asSyncClient\(after\), calendarSync\)/);
  // Клиент прежнего владельца тоже затронут — иначе привязка проекта к
  // клиенту оставила бы события висеть на старом.
  assert.match(sync, /if \(prev\?\.clientId && prev\.clientId !== project\.clientId\) affected\.add\(prev\.clientId\);/);
});

test('статус проекта продвигается тем же сохранением, что и сама запись', () => {
  // Отдельная запись статуса читала бы ещё не обновившийся стейт и затирала
  // только что добавленную сессию — это и был #248.
  assert.doesNotMatch(app, /const advanceProjectStage =/);
  assert.match(app, /const advanceStatusIn = \(source: Project\[\], projectId: string \| null, target: ProjectStatus\): Project\[\] =>/);
  const commit = app.slice(app.indexOf('const commitSession = ('), app.indexOf('const handleAddConsultation ='));
  // Только ВЫПОЛНЕННАЯ сессия двигает проект в «Активен»: назначенная
  // будущая встреча — это и есть окно ожидания предоплаты, снимать
  // «Ожидает предоплаты» она не должна (см. withAdvancedStatus).
  assert.match(commit, /saveProjects\(data\.done \? advanceStatusIn\(withConversion, projectId, 'active'\) : withConversion\)/);
  assert.equal((commit.match(/saveProjects\(/g) ?? []).length, 1, 'ровно одно сохранение на весь сценарий');
});

// Удалённый семишаговый ProjectStage не должен остаться висеть ни в одном
// использовании — иначе экран молча покажет пустой чип/несуществующий этап.
test('в монолите не осталось ссылок на удалённый ProjectStage/PROJECT_STAGES/.stage', () => {
  assert.doesNotMatch(app, /ProjectStage\b/);
  assert.doesNotMatch(app, /PROJECT_STAGES\b/);
  assert.doesNotMatch(app, /withAdvancedStage\b/);
  assert.doesNotMatch(app, /project\.stage\b/);
});

test('автопроект уезжает в базу тем же сохранением, что и запись', () => {
  const commit = app.slice(app.indexOf('const commitSession = ('), app.indexOf('const handleAddConsultation ='));
  assert.match(commit, /const \{ projects: withProject, projectId \} = ensureProject\(projects, presetProjectId \?\? data\.projectId, ownerClient\);/);
  // Прежний ensureProjectId сохранял бакет сам, отдельным вызовом — второе
  // сохранение проектов в том же тике.
  assert.doesNotMatch(app, /const ensureProjectId =/);
});

test('ни одна запись сессии/консультации больше не идёт через saveClient', () => {
  // saveClient остаётся только для полей самой карточки (имя, стили,
  // заметки, документы). Любой sessions:/consultations: в его аргументе
  // означал бы вернувшееся дублирующее хранилище.
  const calls = [...app.matchAll(/saveClient\(\{[\s\S]{0,400}?\}\)/g)].map((m) => m[0]);
  for (const call of calls) {
    assert.doesNotMatch(call, /\bsessions:/, `saveClient пишет сессии: ${call.slice(0, 120)}`);
    assert.doesNotMatch(call, /\bconsultations:/, `saveClient пишет консультации: ${call.slice(0, 120)}`);
  }
});

test('привязка клиента к проекту больше не переносит записи руками', () => {
  const handleAddProject = app.slice(app.indexOf('const handleAddProject = (data'), app.indexOf('const handleAddProjectSession ='));
  // Записи и так лежат на проекте — перенос в client.sessions создавал бы
  // ровно тот дубль, от которого Этап 2 избавляется.
  assert.doesNotMatch(handleAddProject, /saveClient\(/);
  assert.doesNotMatch(handleAddProject, /sessions: \[\], consultations: \[\] \}/);
});

test('старой ручной миграции «Собрать старые записи» больше нет', () => {
  // Она писала в легаси-массивы, которые приложение уже не читает: кнопка
  // не могла бы даже появиться, а нажатие ничего бы не изменило.
  const settings = readSource('../src/components/screens/SettingsScreen.tsx');
  assert.doesNotMatch(app, /migrateRecordsIntoProjects|onMigrateRecords/);
  assert.doesNotMatch(settings, /onMigrateRecords|hasUnorganizedRecords|Собрать старые записи/);
});

test('клиент-формы сохранения записей удалены — второго способа записать нет', () => {
  const sessionSave = readSource('../src/lib/sessionSave.ts');
  const consultationSave = readSource('../src/lib/consultationSave.ts');
  for (const source of [sessionSave, consultationSave]) {
    // Именно объявлений быть не должно (упоминание в комментарии о том, что
    // они удалены, — это не второй способ записи).
    assert.doesNotMatch(
      source,
      /export function (upsertClientSession|upsertProjectSession|upsertConsultation|upsertProjectConsultation|applyConsultationConversion|applyConsultationRestoration)\b/,
    );
  }
  // В приложении не осталось и вызовов: единственные упоминания — новые
  // *InProjects-функции, у которых имя лишь начинается так же.
  assert.doesNotMatch(app, /\bupsertClientSession\b|\bupsertProjectSession\b|\bupsertProjectConsultation\b|\bapplyConsultationConversion\(|\bapplyConsultationRestoration\b/);
});
