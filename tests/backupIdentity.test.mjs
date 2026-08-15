import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INSTALLATION_ID_STORAGE_KEY,
  compareBackupSource,
  readOrCreateInstallationId,
} from '../.test-dist/src/lib/backupIdentity.js';

test('installation id is created once and then stays stable', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  let creates = 0;
  const create = () => `installation-${++creates}`;

  assert.equal(readOrCreateInstallationId(storage, create), 'installation-1');
  assert.equal(readOrCreateInstallationId(storage, create), 'installation-1');
  assert.equal(values.get(INSTALLATION_ID_STORAGE_KEY), 'installation-1');
  assert.equal(creates, 1);
});

test('same installation wins even if the master renamed the profile', () => {
  assert.equal(
    compareBackupSource(
      { installationId: 'one', ownerName: 'Старое имя' },
      { installationId: 'one', ownerName: 'Новое имя' },
    ),
    'same-installation',
  );
});

test('same owner on another device is recognised without a foreign-owner alarm', () => {
  assert.equal(
    compareBackupSource(
      { installationId: 'tablet', ownerName: '  Анна   Иванова ' },
      { installationId: 'phone', ownerName: 'анна иванова' },
    ),
    'same-owner',
  );
});

test('different named owner is a foreign diary and requires the extra confirmation', () => {
  assert.equal(
    compareBackupSource(
      { installationId: 'master-a', ownerName: 'Анна' },
      { installationId: 'master-b', ownerName: 'Мария' },
    ),
    'different-owner',
  );
});

test('old or unnamed archives remain importable but are not claimed as a match', () => {
  assert.equal(
    compareBackupSource(
      { installationId: null, ownerName: '' },
      { installationId: 'current', ownerName: 'Анна' },
    ),
    'unknown',
  );
});
