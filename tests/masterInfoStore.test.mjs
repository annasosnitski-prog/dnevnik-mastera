import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MASTER_INFO,
  normalizeMasterInfo,
  resolveMasterInfoSource,
  isMasterInfoEmpty,
  masterInfoFromBackup,
  applyMasterInfoRestore,
} from '../.test-dist/src/lib/masterInfoStore.js';
import { defaultModuleFlags } from '../.test-dist/src/modules/registry.js';

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

test('пустая запись получает модули по умолчанию из реестра', () => {
  assert.deepEqual(normalizeMasterInfo({}).modules, defaultModuleFlags());
  assert.deepEqual(DEFAULT_MASTER_INFO.modules, defaultModuleFlags());
});

test('модуль, добавленный в реестр позже записи в базе, получает свой defaultActive, а не пропадает', () => {
  const info = normalizeMasterInfo({ modules: { content: false } });
  assert.equal(info.modules.content, false);
  assert.deepEqual(info.modules, { ...defaultModuleFlags(), content: false });
});

test('битые модули (не объект) не роняют карточку', () => {
  const info = normalizeMasterInfo({ modules: 'мусор' });
  assert.deepEqual(info.modules, defaultModuleFlags());
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

// ===== КАБИНЕТ В РЕЗЕРВНОЙ КОПИИ =====
// До этого в копию уезжали только задачи мастера: имя, телефон, реквизиты,
// ссылка на бота, чат-ссылки и подписи цветов не сохранялись никуда, и
// восстановление на новом телефоне возвращало историю работы без всего
// личного.

const filledCard = {
  ...DEFAULT_MASTER_INFO,
  name: 'Анна',
  phone: '+7 900 000-00-00',
  bankDetails: 'Сбер 1234',
  telegramBotLink: 'https://t.me/inka_bot',
  colorLabels: { '#c0392b': 'сложные' },
};

test('новая копия несёт карточку целиком', () => {
  const restore = masterInfoFromBackup({ clients: [], masterInfo: filledCard });

  assert.equal(restore.kind, 'full');
  assert.equal(restore.info.name, 'Анна');
  assert.equal(restore.info.bankDetails, 'Сбер 1234');
  // Ради этого поля всё и затевалось: свою систему маркировки клиентов
  // мастер по памяти не восстановит.
  assert.deepEqual(restore.info.colorLabels, { '#c0392b': 'сложные' });
});

test('старая копия несёт только задачи — и не выдаёт себя за карточку целиком', () => {
  // Иначе восстановление старого файла СТЁРЛО бы имя и реквизиты — тем
  // самым действием, которое их спасает.
  const restore = masterInfoFromBackup({ clients: [], masterNotes: [{ id: 'n1', text: 'позвонить' }] });

  assert.equal(restore.kind, 'notes');
  assert.equal(restore.notes.length, 1);
  assert.equal(restore.notes[0].text, 'позвонить');
});

test('восстановление старой копии сохраняет всё, кроме задач', () => {
  const restore = masterInfoFromBackup({ masterNotes: [{ id: 'n1', text: 'новая' }] });
  const applied = applyMasterInfoRestore(filledCard, restore);

  assert.equal(applied.name, 'Анна', 'имя не тронуто');
  assert.equal(applied.bankDetails, 'Сбер 1234', 'реквизиты не тронуты');
  assert.deepEqual(applied.colorLabels, { '#c0392b': 'сложные' }, 'подписи цветов не тронуты');
  assert.equal(applied.notes.length, 1);
});

test('восстановление новой копии заменяет карточку целиком', () => {
  const restore = masterInfoFromBackup({ masterInfo: { ...DEFAULT_MASTER_INFO, name: 'из копии' } });
  const applied = applyMasterInfoRestore(filledCard, restore);

  assert.equal(applied.name, 'из копии');
  assert.equal(applied.bankDetails, '', 'копия — источник истины целиком, а не поверх текущего');
});

test('в копии нового вида задачи лежат внутри карточки, а не отдельным ключом', () => {
  // Задачи несут фото; отдельный masterNotes в том же файле удваивал бы
  // самую тяжёлую его часть. Поэтому masterInfo и читается первым.
  const restore = masterInfoFromBackup({
    masterInfo: { ...filledCard, notes: [{ id: 'n1', text: 'из карточки' }] },
    masterNotes: [{ id: 'n2', text: 'из старого ключа' }],
  });

  assert.equal(restore.kind, 'full');
  assert.equal(restore.info.notes[0].text, 'из карточки');
});

test('файл без кабинета не трогает текущий', () => {
  // Совсем старая копия или голый массив клиентов.
  assert.equal(masterInfoFromBackup({ clients: [] }), null);
  assert.equal(masterInfoFromBackup([]), null);
  assert.equal(masterInfoFromBackup(null), null);
  assert.equal(masterInfoFromBackup('не объект'), null);
});

test('битый кабинет в файле не роняет импорт', () => {
  const restore = masterInfoFromBackup({ masterInfo: { name: 42, links: 'мусор', colorLabels: 'мусор' } });

  assert.equal(restore.kind, 'full');
  assert.equal(restore.info.name, '');
  assert.deepEqual(restore.info.links, []);
});
