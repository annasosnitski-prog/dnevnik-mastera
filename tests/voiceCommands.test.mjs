import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeIntent, parseIntentLocal } from '../.test-dist/src/voice/intent.js';
import { canConfirmDraft, draftValues, findVoiceCommand } from '../.test-dist/src/voice/commands.js';

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
  assert.equal(parseIntentLocal('открой клиента Ольгу').action, 'unknown');
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
  const draft = command.buildDraft(parseIntentLocal('новый клиент Ольга Петрова'));
  assert.equal(draft.commandId, 'client.create');
  assert.deepEqual(draftValues(draft), { name: 'Ольга', surname: 'Петрова', phone: '', note: '' });
  assert.equal(canConfirmDraft(draft), true);

  const empty = command.buildDraft(parseIntentLocal('новый клиент'));
  assert.equal(canConfirmDraft(empty), false);
});

test('реестр: неизвестное намерение — команды нет', () => {
  assert.equal(findVoiceCommand(normalizeIntent({ action: 'open', entity: 'client' }, 'x', 'llm')), null);
});
