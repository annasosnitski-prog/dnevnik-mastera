import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MASTER_INFO,
  normalizeMasterInfo,
  resolveMasterInfoSource,
  isMasterInfoEmpty,
} from '../.test-dist/src/lib/masterInfoStore.js';

test('битая или пустая запись не роняет карточку', () => {
  for (const raw of [null, undefined, 'строка', 42, []]) {
    const info = normalizeMasterInfo(raw);
    assert.equal(info.name, '');
    assert.deepEqual(info.notes, []);
    assert.deepEqual(info.links, []);
  }
});

test('нормализация переживает мусор в любом поле', () => {
  const info = normalizeMasterInfo({
    name: 42,
    links: 'не массив',
    bankDetails: null,
    chatLinks: { нет: 'массива' },
    colorLabels: 'строка',
    notes: null,
  });
  assert.equal(info.name, '');
  assert.deepEqual(info.links, []);
  assert.equal(info.bankDetails, '');
  assert.deepEqual(info.chatLinks, []);
  assert.deepEqual(info.colorLabels, {});
  assert.deepEqual(info.notes, []);
});

test('нормализация сохраняет заполненную карточку', () => {
  const info = normalizeMasterInfo({
    name: 'Анна',
    phone: '+7 900',
    bankDetails: 'СБП',
    telegramBotLink: 'https://t.me/bot',
    links: [{ id: 'l1', label: 'Instagram', value: '@anna' }],
    colorLabels: { '#C9A227': 'Постоянные' },
    notes: [{ id: 'n1', text: 'позвонить', urgency: 'normal', done: false, createdDate: '2026-01-01', photos: [] }],
  });
  assert.equal(info.name, 'Анна');
  assert.equal(info.phone, '+7 900');
  assert.equal(info.bankDetails, 'СБП');
  assert.equal(info.telegramBotLink, 'https://t.me/bot');
  assert.deepEqual(info.links, [{ id: 'l1', label: 'Instagram', value: '@anna' }]);
  assert.deepEqual(info.colorLabels, { '#C9A227': 'Постоянные' });
  assert.equal(info.notes.length, 1);
  assert.equal(info.notes[0].text, 'позвонить');
});

test('легаси-поле website не теряется, а становится ссылкой «Сайт»', () => {
  const info = normalizeMasterInfo({ website: 'anna.ru' });
  assert.equal(info.chatLinks.length, 1);
  assert.equal(info.chatLinks[0].platform, 'website');
  assert.match(info.chatLinks[0].url, /anna\.ru/);
});

test('неизвестная платформа ссылки не теряет саму ссылку', () => {
  const info = normalizeMasterInfo({ chatLinks: [{ id: 'c1', platform: 'мессенджер-которого-нет', url: 'https://x.test' }] });
  assert.equal(info.chatLinks[0].platform, 'other');
  assert.equal(info.chatLinks[0].url, 'https://x.test');
});

// ── Выбор источника на старте ────────────────────────────────────────────

test('запись в базе выигрывает — правки уходят туда, localStorage отстаёт', () => {
  const fromDb = { ...DEFAULT_MASTER_INFO, name: 'из базы' };
  const fromLocal = { ...DEFAULT_MASTER_INFO, name: 'из localStorage' };

  const resolved = resolveMasterInfoSource(fromDb, fromLocal);

  assert.equal(resolved.value.name, 'из базы');
  assert.equal(resolved.needsMigration, false);
});

test('записи в базе нет — показываем старую копию и переносим её', () => {
  const fromLocal = { ...DEFAULT_MASTER_INFO, name: 'из localStorage' };

  const resolved = resolveMasterInfoSource(null, fromLocal);

  assert.equal(resolved.value.name, 'из localStorage');
  assert.equal(resolved.needsMigration, true);
});

test('ПУСТАЯ запись в базе — это запись, а не её отсутствие', () => {
  // Мастер стёрла имя и контакты. Вернуть здесь localStorage-копию значило бы
  // воскрешать удалённое при каждом запуске.
  const emptyInDb = { ...DEFAULT_MASTER_INFO };
  const fromLocal = { ...DEFAULT_MASTER_INFO, name: 'старое имя' };

  const resolved = resolveMasterInfoSource(emptyInDb, fromLocal);

  assert.equal(resolved.value.name, '');
  assert.equal(resolved.needsMigration, false);
});

test('пустую карточку переносить незачем', () => {
  assert.equal(isMasterInfoEmpty({ ...DEFAULT_MASTER_INFO }), true);
  assert.equal(isMasterInfoEmpty({ ...DEFAULT_MASTER_INFO, name: 'Анна' }), false);
  assert.equal(isMasterInfoEmpty({ ...DEFAULT_MASTER_INFO, name: '   ' }), true, 'пробелы — не содержимое');
  assert.equal(isMasterInfoEmpty({ ...DEFAULT_MASTER_INFO, notes: [{ id: 'n1' }] }), false);
  assert.equal(isMasterInfoEmpty({ ...DEFAULT_MASTER_INFO, colorLabels: { '#fff': 'свои' } }), false);
});
