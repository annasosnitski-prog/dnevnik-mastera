import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STORAGE_ACTIONS,
  storageFailureMessage,
  storageFailureNeedsReconnect,
} from '../.test-dist/src/lib/storageMessages.js';

test('каждое состояние говорит, что случилось И что делать', () => {
  for (const kind of ['lost', 'write', 'read', 'conflicting']) {
    const text = storageFailureMessage(kind, STORAGE_ACTIONS.saveClient);
    assert.ok(text.length > 0);
    // Две мысли в каждом сообщении: суть и действие.
    assert.ok(text.split('.').filter((p) => p.trim()).length >= 2, `«${text}» не говорит, что делать`);
  }
});

test('отказ записи называет операцию — иначе непонятно, что не сохранилось', () => {
  const text = storageFailureMessage('write', STORAGE_ACTIONS.saveProject);
  assert.match(text, /сохранение проекта/);
  assert.match(text, /Повторите последнее действие/);
});

test('потеря связи про хранилище целиком, а не про операцию', () => {
  // Уточнять «при сохранении клиента» здесь незачем: отключилось всё.
  const text = storageFailureMessage('lost', STORAGE_ACTIONS.saveClient);
  assert.doesNotMatch(text, /сохранение клиента/);
  assert.match(text, /Повторить/);
  assert.match(text, /данные на месте/);
});

test('чтение сразу успокаивает: данные целы', () => {
  const text = storageFailureMessage('read', STORAGE_ACTIONS.loadClients);
  assert.match(text, /загрузка клиентов/);
  assert.match(text, /данные целы/);
});

test('«Повторить» предлагается только там, где есть что переподключать', () => {
  assert.equal(storageFailureNeedsReconnect('lost'), true);
  assert.equal(storageFailureNeedsReconnect('conflicting'), true);
  // Связь есть — переподключаться не к чему, повторить нужно само действие.
  assert.equal(storageFailureNeedsReconnect('write'), false);
  assert.equal(storageFailureNeedsReconnect('read'), false);
});

test('без названия операции сообщение всё равно осмысленно', () => {
  const text = storageFailureMessage('write');
  assert.match(text, /Не удалось сохранить/);
  assert.match(text, /Повторите последнее действие/);
});

test('в текстах нет технических слов', () => {
  const forbidden = /транзакц|IndexedDB|соединени|объект|стор\b/i;
  for (const kind of ['lost', 'write', 'read', 'conflicting']) {
    for (const action of [undefined, STORAGE_ACTIONS.saveClient]) {
      assert.doesNotMatch(storageFailureMessage(kind, action), forbidden);
    }
  }
});

test('названия операций — про работу мастера, а не про код', () => {
  for (const action of Object.values(STORAGE_ACTIONS)) {
    assert.doesNotMatch(action, /[A-Za-z]/, `«${action}» содержит латиницу`);
  }
});
