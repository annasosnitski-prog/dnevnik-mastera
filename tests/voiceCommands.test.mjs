import assert from 'node:assert/strict';
import test from 'node:test';

// Суббота, 21 ноября 2026.
const TODAY = '2026-11-21';
const entry = (id, kind, projectId, date, time = '', extra = {}) => ({
  id, kind, projectId, date, time, title: '', done: false, cancelled: false, ...extra,
});
const CTX = {
  today: TODAY,
  clients: [
    { id: 'olga', name: 'Ольга', surname: 'Петрова' },
    { id: 'olga2', name: 'Ольга', surname: 'Смирнова' },
    { id: 'marina', name: 'Марина', surname: '' },
  ],
  projects: [
    { id: 'dragon', title: 'Дракон', clientId: 'olga', completed: false, entries: [
      entry('s1', 'session', 'dragon', '2026-11-25', '14:00'),
      entry('s0', 'session', 'dragon', '2026-11-01', '12:00', { done: true }),
    ] },
    { id: 'rose', title: 'Роза на плече', clientId: 'marina', completed: false, entries: [
      entry('c1', 'consultation', 'rose', '2026-11-22', '12:00'),
    ] },
    { id: 'wave', title: 'Волна', clientId: 'olga2', completed: false, entries: [
      entry('s2', 'session', 'wave', '2026-11-22', '16:00'),
    ] },
    { id: 'sketch', title: 'Эскизы для флеша', clientId: null, completed: false, entries: [] },
  ],
};

import { normalizeIntent, parseIntentLocal } from '../.test-dist/src/voice/intent.js';
import { buildVoiceResult, canConfirmDraft, draftValues, findVoiceCommand } from '../.test-dist/src/voice/commands.js';

test('parseIntentLocal: новый клиент с именем, фамилией и телефоном', () => {
  const intent = parseIntentLocal('новый клиент ольга петрова телефон 8 999 123-45-67');
  assert.equal(intent.action, 'create');
  assert.equal(intent.entity, 'client');
  assert.deepEqual(intent.fields, { name: 'Ольга', surname: 'Петрова', phone: '89991234567' });
  assert.equal(intent.source, 'local');
});

test('parseIntentLocal: варианты начала фразы и заметка', () => {
  const a = parseIntentLocal('Добавь нового клиента Марина, заметка: хочет рукав в стиле дотворк');
  assert.equal(a.entity, 'client');
  assert.equal(a.fields.name, 'Марина');
  assert.equal(a.fields.note, 'хочет рукав в стиле дотворк');
  assert.equal(a.fields.surname, undefined);

  const b = parseIntentLocal('Новая клиентка Ноа +972 50 123 4567');
  assert.equal(b.fields.name, 'Ноа');
  assert.equal(b.fields.phone, '+972501234567');
});

test('parseIntentLocal: без имени — черновик пустой, но команда узнана', () => {
  const intent = parseIntentLocal('новый клиент');
  assert.equal(intent.action, 'create');
  assert.deepEqual(intent.fields, {});
});

test('parseIntentLocal: «клиентский» и прочее — не команда', () => {
  assert.equal(parseIntentLocal('новый клиентский проект').action, 'unknown');
  assert.equal(parseIntentLocal('').action, 'unknown');
});

test('normalizeIntent: мусор от сервера не роняет разбор', () => {
  const intent = normalizeIntent({ action: 'fly', entity: 'dragon', fields: { name: ' Оля ', age: 30, bad: null, empty: '' } }, 'x', 'llm');
  assert.equal(intent.action, 'unknown');
  assert.equal(intent.entity, null);
  assert.deepEqual(intent.fields, { name: 'Оля', age: '30' });
  assert.equal(normalizeIntent(null, 'x', 'llm').action, 'unknown');
});

test('реестр: «новый клиент» → черновик, галочка только с именем', () => {
  const command = findVoiceCommand(parseIntentLocal('новый клиент Ольга Петрова'));
  assert.ok(command);
  const { draft } = command.build(parseIntentLocal('новый клиент Ольга Петрова'), CTX);
  assert.equal(draft.commandId, 'client.create');
  assert.deepEqual(draftValues(draft), { name: 'Ольга', surname: 'Петрова', phone: '', note: '' });
  assert.equal(canConfirmDraft(draft), true);

  const { draft: empty } = command.build(parseIntentLocal('новый клиент'), CTX);
  assert.equal(canConfirmDraft(empty), false);
});

test('реестр: неизвестное намерение — команды нет', () => {
  assert.equal(findVoiceCommand(normalizeIntent({ action: 'generate', entity: 'content' }, 'x', 'llm')), null);
});

// ── Даты из речи ──────────────────────────────────────────────────────────
import { findDates, findTimes, normalizeDate, normalizeTime } from '../.test-dist/src/voice/dates.js';

test('даты: сегодня/завтра/дни недели/числа/через неделю', () => {
  const d = (t) => findDates(t, TODAY)[0]?.date;
  assert.equal(d('сегодня'), '2026-11-21');
  assert.equal(d('на завтра'), '2026-11-22');
  assert.equal(d('послезавтра'), '2026-11-23');
  assert.equal(d('в пятницу'), '2026-11-27');
  assert.equal(d('в субботу'), '2026-11-28'); // сегодня суббота → следующая
  assert.equal(d('на следующий вторник'), '2026-12-01');
  assert.equal(d('25 ноября'), '2026-11-25');
  assert.equal(d('5 января'), '2027-01-05'); // прошедший месяц → следующий год
  assert.equal(d('28.11'), '2026-11-28');
  assert.equal(d('через неделю'), '2026-11-28');
  assert.equal(d('через 3 дня'), '2026-11-24');
  assert.equal(d('просто текст'), undefined);
});

test('время: 14:00, в 14, в 3 часа дня', () => {
  const t = (s) => findTimes(s)[0]?.time;
  assert.equal(t('в 14:00'), '14:00');
  assert.equal(t('в 9.30'), '09:30');
  assert.equal(t('в 14'), '14:00');
  assert.equal(t('в 3 часа дня'), '15:00');
  assert.equal(t('к 7 вечера'), '19:00');
  assert.equal(t('на 25 ноября'), undefined);
  assert.equal(t('на 28.11'), undefined);
  assert.equal(normalizeTime('15:30'), '15:30');
  assert.equal(normalizeDate('2026-12-01', TODAY), '2026-12-01');
  assert.equal(normalizeDate('в пятницу', TODAY), '2026-11-27');
});

// ── Локальный разбор новых команд ─────────────────────────────────────────

test('локально: новая сессия с клиентом, датой и временем', () => {
  const i = parseIntentLocal('Новая сессия для Ольги Петровой завтра в 14:00', TODAY);
  assert.equal(i.action, 'create');
  assert.equal(i.entity, 'session');
  assert.equal(i.fields.date, '2026-11-22');
  assert.equal(i.fields.time, '14:00');
  assert.equal(i.fields.ref, 'для Ольги Петровой');
});

test('локально: консультация, перенос, отмена', () => {
  const c = parseIntentLocal('запиши консультацию с Мариной в пятницу в 12', TODAY);
  assert.equal(c.entity, 'consultation');
  assert.equal(c.fields.date, '2026-11-27');
  assert.equal(c.fields.time, '12:00');

  const m = parseIntentLocal('перенеси сессию Ольги на пятницу в 15', TODAY);
  assert.equal(m.action, 'move');
  assert.equal(m.entity, 'session');
  assert.equal(m.fields.date, '2026-11-27');
  assert.equal(m.fields.time, '15:00');

  const m2 = parseIntentLocal('передвинь консультацию с 22 ноября на 24 ноября', TODAY);
  assert.equal(m2.entity, 'consultation');
  assert.equal(m2.fields.fromDate, '2026-11-22');
  assert.equal(m2.fields.date, '2026-11-24');

  const x = parseIntentLocal('отмени сессию Ольги', TODAY);
  assert.equal(x.action, 'cancel');
  assert.equal(x.fields.ref, 'Ольги');
});

test('локально: новый проект с клиентом', () => {
  const p = parseIntentLocal('новый проект дракон для Ольги Петровой', TODAY);
  assert.equal(p.entity, 'project');
  assert.equal(p.fields.title, 'Дракон');
  assert.equal(p.fields.client, 'Ольги Петровой');
  assert.equal(parseIntentLocal('создай проект Эскизы для флеша', TODAY).fields.client, 'флеша');
});

test('локально: заметки к проекту, сессии, консультации', () => {
  const a = parseIntentLocal('заметка к проекту Дракон: добавить облака', TODAY);
  assert.equal(a.entity, 'note');
  assert.equal(a.fields.target, 'project');
  assert.equal(a.fields.ref, 'Дракон');
  assert.equal(a.fields.note, 'добавить облака');

  const b = parseIntentLocal('добавь заметку к сессии Ольги клиентка просила светлее', TODAY);
  assert.equal(b.fields.target, 'session');
  assert.equal(b.fields.refWithNote, '1');

  assert.equal(parseIntentLocal('заметка к консультации Марины — принесёт референсы', TODAY).fields.target, 'consultation');
});

test('локально: напоминание, закрыть проект, открыть, кто завтра', () => {
  const r = parseIntentLocal('напомни завтра заказать иглы', TODAY);
  assert.equal(r.entity, 'reminder');
  assert.equal(r.fields.date, '2026-11-22');
  assert.equal(r.fields.note, 'заказать иглы');

  assert.equal(parseIntentLocal('закрой проект Дракон', TODAY).action, 'complete');
  const o = parseIntentLocal('открой клиента Ольгу', TODAY);
  assert.equal(o.action, 'open');
  assert.equal(o.entity, 'client');

  const s = parseIntentLocal('кто у меня завтра', TODAY);
  assert.equal(s.action, 'ask');
  assert.equal(s.entity, 'schedule');
  assert.equal(s.fields.date, '2026-11-22');
});

// ── Команды с контекстом: выбор и переспрос ───────────────────────────────

const run = (text) => buildVoiceResult(parseIntentLocal(text, TODAY), CTX);
const field = (draft, key) => draft.fields.find((f) => f.key === key);

test('сессия: один клиент → его проект выбран сразу', () => {
  const r = run('новая сессия для Ольги Петровой завтра в 14:00');
  assert.equal(r.type, 'draft');
  assert.equal(r.draft.commandId, 'session.create');
  assert.equal(field(r.draft, 'project').value, 'dragon');
  assert.equal(field(r.draft, 'date').value, '2026-11-22');
  assert.equal(canConfirmDraft(r.draft), true);
});

test('сессия: две Ольги → переспрос, галочка неактивна', () => {
  const r = run('новая сессия для Ольги в пятницу');
  const project = field(r.draft, 'project');
  assert.equal(project.value, '');
  assert.ok(project.options.some((o) => o.value === 'dragon'));
  assert.ok(project.options.some((o) => o.value === 'wave'));
  assert.equal(canConfirmDraft(r.draft), false);
  assert.ok(r.draft.hint);
});

test('консультация: клиент без проектов → «новый проект» для него', () => {
  const ctx = { ...CTX, clients: [...CTX.clients, { id: 'noa', name: 'Ноа', surname: '' }] };
  const r = buildVoiceResult(parseIntentLocal('консультация с Ноа завтра', TODAY), ctx);
  assert.equal(field(r.draft, 'project').value, 'new:noa');
});

test('перенос: сессия Ольги Петровой выбрана, прошедшая не предлагается', () => {
  const r = run('перенеси сессию Ольги Петровой на пятницу в 15');
  const e = field(r.draft, 'entry');
  assert.deepEqual(e.options.map((o) => o.value), ['s1']);
  assert.equal(e.value, 's1');
  assert.equal(field(r.draft, 'date').value, '2026-11-27');
  assert.equal(field(r.draft, 'time').value, '15:00');
});

test('перенос: время не сказано — остаётся прежним', () => {
  const r = run('перенеси консультацию Марины на 24 ноября');
  assert.equal(field(r.draft, 'entry').value, 'c1');
  assert.equal(field(r.draft, 'time').value, '12:00');
});

test('отмена: запись выбрана, подтверждение нужно', () => {
  const r = run('отмени консультацию Марины');
  assert.equal(r.draft.commandId, 'consultation.cancel');
  assert.equal(field(r.draft, 'entry').value, 'c1');
});

test('проект: клиент найден, без клиента — «Без клиента»', () => {
  const a = run('новый проект Феникс для Марины');
  assert.equal(field(a.draft, 'title').value, 'Феникс');
  assert.equal(field(a.draft, 'client').value, 'marina');
  const b = run('новый проект Феникс');
  assert.equal(field(b.draft, 'client').value, 'none');
  assert.equal(canConfirmDraft(b.draft), true);
});

test('заметки: проект по названию, сессия по клиенту без разделителя', () => {
  const a = run('заметка к проекту Дракон: добавить облака');
  assert.equal(a.draft.commandId, 'note.project');
  assert.equal(field(a.draft, 'project').value, 'dragon');
  assert.equal(field(a.draft, 'note').value, 'добавить облака');

  const b = run('добавь заметку к сессии Ольги Петровой клиентка просила светлее');
  assert.equal(b.draft.commandId, 'note.session');
  assert.equal(field(b.draft, 'note').value, 'клиентка просила светлее');
  // У Ольги Петровой две сессии — ближайшая к сегодня первой, выбрать надо.
  assert.equal(field(b.draft, 'entry').options[0].value, 's1');

  const c = run('заметка к консультации Марины — принесёт референсы');
  assert.equal(c.draft.commandId, 'note.consultation');
  assert.equal(field(c.draft, 'entry').value, 'c1');
  assert.equal(field(c.draft, 'note').value, 'принесёт референсы');
});

test('открыть: один клиент — сразу, несколько — плитки, нет — сообщение', () => {
  assert.deepEqual(run('открой Марину'), { type: 'action', commandId: 'client.open', values: { client: 'marina' } });
  const two = run('открой клиента Ольгу');
  assert.equal(two.type, 'draft');
  assert.equal(field(two.draft, 'client').options.length, 2);
  assert.equal(run('открой клиента Василису').type, 'message');
  assert.equal(run('открой проект Дракон').values.project, 'dragon');
});

test('кто у меня завтра: записи → плитки, одна → сразу, нет → админка', () => {
  const many = run('кто у меня завтра');
  assert.equal(many.type, 'draft');
  assert.deepEqual(field(many.draft, 'entry').options.map((o) => o.value), ['c1', 's2']);
  const one = run('что у меня 25 ноября');
  assert.deepEqual(one, { type: 'action', commandId: 'entry.open', values: { entry: 's1' } });
  const none = run('кто у меня послезавтра');
  assert.equal(none.type, 'action');
  assert.equal(none.commandId, 'schedule.empty');
  assert.ok(none.message.includes('записей нет'));
});

test('закрыть проект и напоминание', () => {
  const p = run('закрой проект Дракон');
  assert.equal(field(p.draft, 'project').value, 'dragon');
  const r = run('напомни в пятницу купить краски');
  assert.equal(field(r.draft, 'date').value, '2026-11-27');
  assert.equal(field(r.draft, 'note').value, 'купить краски');
});

test('модель: поля client/project/date из LLM тоже понимаются', () => {
  const intent = normalizeIntent(
    { action: 'move', entity: 'session', fields: { client: 'Ольга Петрова', date: '2026-11-30', time: '11:00' } },
    'x',
    'llm',
  );
  const r = buildVoiceResult(intent, CTX);
  assert.equal(field(r.draft, 'entry').value, 's1');
  assert.equal(field(r.draft, 'date').value, '2026-11-30');
});

// ── Полная карточка из диктовки ───────────────────────────────────────────
import { extractCardFields } from '../.test-dist/src/voice/cardFields.js';

test('карточка: метки раскладываются по полям сессии', () => {
  const { fields, head } = extractCardFields(
    'session',
    'для Ольги завтра в 12 на 4 часа, стиль дотворк, зона левое предплечье, цвета чёрный и серый, иглы 3RL и 7RM, заметка клиентка пьёт кофе',
  );
  assert.match(head, /^для Ольги завтра в 12/);
  assert.equal(fields.duration, '4 ч');
  assert.equal(fields.style, 'дотворк');
  assert.equal(fields.area, 'левое предплечье');
  assert.equal(fields.colors, 'чёрный и серый');
  assert.equal(fields.needles, '3RL и 7RM');
  assert.equal(fields.note, 'клиентка пьёт кофе');
});

test('карточка: полная сессия — поля заполнены, ненадиктованные пусты', () => {
  const r = run('новая сессия для Ольги Петровой завтра в 12 на 4 часа, стиль дотворк, иглы 3RL');
  const d = r.draft;
  assert.equal(field(d, 'project').value, 'dragon');
  assert.equal(field(d, 'date').value, '2026-11-22');
  assert.equal(field(d, 'time').value, '12:00');
  assert.equal(field(d, 'duration').value, '4 ч');
  assert.equal(field(d, 'style').value, 'дотворк');
  assert.equal(field(d, 'needles').value, '3RL');
  assert.equal(field(d, 'colors').value, '');
  assert.equal(field(d, 'status').value, 'planned');
  assert.equal(canConfirmDraft(d), true);
});

test('карточка: «уже прошла» → выполнена; «в 3 часа» — время, не длительность', () => {
  const d = run('сессия для Марины сегодня в 3 часа дня, уже прошла, реакция кожи небольшое покраснение').draft;
  assert.equal(field(d, 'status').value, 'done');
  assert.equal(field(d, 'time').value, '15:00');
  assert.equal(field(d, 'duration').value, '');
  assert.equal(field(d, 'skinReaction').value, 'небольшое покраснение');
});

test('карточка: консультация — ощущение, референсы, итог, срочность', () => {
  const d = run('консультация с Мариной в пятницу в 12, срочно, место плечо, ощущение лёгкость, референсы работы Ани Ли, итог делаем эскиз').draft;
  assert.equal(field(d, 'urgency').value, 'urgent');
  assert.equal(field(d, 'area').value, 'плечо');
  assert.equal(field(d, 'feeling').value, 'лёгкость');
  assert.equal(field(d, 'inspirationSources').value, 'работы Ани Ли');
  assert.equal(field(d, 'outcome').value, 'делаем эскиз');
});

test('карточка: проект — категория, план встреч, место из списка, первая сессия', () => {
  const d = run('новый проект Феникс для Марины, стиль японский, место левая лопатка, несколько сессий, первая сессия 5 декабря, идеи пламя и перья').draft;
  assert.equal(field(d, 'title').value, 'Феникс');
  assert.equal(field(d, 'client').value, 'marina');
  assert.equal(field(d, 'category').value, 'tattoo');
  assert.equal(field(d, 'sessionsPlan').value, 'multiple');
  assert.equal(field(d, 'area').value, 'Лопатка');
  assert.equal(field(d, 'area').uncertain, undefined);
  assert.equal(field(d, 'style').value, 'японский');
  assert.equal(field(d, 'firstSessionDate').value, '2026-12-05');
  assert.equal(field(d, 'creative').value, 'пламя и перья');
});

test('карточка: место не из списка и неуверенные поля модели подсвечены', () => {
  const d = run('новый проект Кит, место за ухом').draft;
  assert.equal(field(d, 'area').value, 'за ухом');
  assert.equal(field(d, 'area').uncertain, true);

  const intent = normalizeIntent(
    { action: 'create', entity: 'session', fields: { client: 'Марина', style: 'графика', colors: 'красный' }, uncertain: ['colors', 'nope'] },
    'x',
    'llm',
  );
  assert.deepEqual(intent.uncertain, ['colors']);
  const r = buildVoiceResult(intent, CTX).draft;
  assert.equal(field(r, 'colors').uncertain, true);
  assert.equal(field(r, 'style').uncertain, undefined);
});
