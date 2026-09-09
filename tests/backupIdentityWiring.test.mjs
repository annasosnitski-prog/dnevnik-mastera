import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const app = readSource('../src/components/TattoDiary.tsx');
const settings = readSource('../src/components/screens/SettingsScreen.tsx');
const archive = readSource('../src/lib/backupArchive.ts');

test('root creates one installation id and passes it only as backup identity', () => {
  assert.match(app, /const \[installationId\] = useState\(readOrCreateInstallationId\);/);
  assert.match(app, /installationId=\{installationId\}/);
});

test('new v6 archives carry installation id and master name in the manifest', () => {
  assert.match(settings, /source: \{ installationId, ownerName: masterInfo\.name\.trim\(\) \}/);
  assert.match(archive, /source: options\.source/);
  assert.match(archive, /archiveFilename\(now, options\.source\.ownerName\)/);
});

test('a backup from another named master cannot restore on the first confirmation tap', () => {
  assert.match(settings, /const isForeignOwner = archiveSourceRelation === 'different-owner';/);
  assert.match(settings, /archiveSourceRelation !== 'same-installation'/);
  assert.match(settings, /Сейчас открыт дневник/);
  assert.match(settings, /needsSourceAcknowledgement && !foreignImportAcknowledged/);
  assert.match(settings, /setForeignImportAcknowledged\(true\)/);
  assert.match(settings, /'Это нужная копия' : 'Заменить'/);
});

test('same owner on another device is labelled and still gets the cross-device acknowledgement', () => {
  assert.match(settings, /archiveSourceRelation === 'same-owner'/);
  assert.match(settings, /создана на другом устройстве этого владельца/);
  assert.match(settings, /archiveSourceRelation !== 'same-installation'/);
});
