import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { downsizeForContentDuplicate, downsizeForStorage } from '../.test-dist/src/lib/imagePreview.js';

// ContentEntry.photos — не ссылка на Session.photos, а самостоятельная
// копия в отдельном IndexedDB store ('contentEntries'), которая переживает
// удаление или правку исходной сессии. Это осознанное решение, но значит —
// НАВСЕГДА второй экземпляр тех же байт, и с каждым повторным «Отправить»
// по одной сессии добавляется ещё один (см. findLinkedContentEntries).
// Раз это заведомый дубль, ему незачем весить как единственная копия в
// Session.photos — здесь проверяем, что он от неё меньше, и что
// ContentINKAScreen действительно использует лёгкий пресет, а не общий
// downsizeForStorage.

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
}

const screen = readSource('../src/components/screens/ContentINKAScreen.tsx');

test('копия фото для ContentEntry весит заметно меньше копии в Session.photos', () => {
  assert.ok(
    downsizeForContentDuplicate.toString() !== downsizeForStorage.toString(),
    'downsizeForContentDuplicate должен быть отдельной функцией, а не алиасом downsizeForStorage',
  );
  const duplicateDefaults = downsizeForContentDuplicate.toString().match(/maxSide = (\d+), quality = ([\d.]+)/);
  const storageDefaults = downsizeForStorage.toString().match(/maxSide = (\d+), quality = ([\d.]+)/);
  assert.ok(duplicateDefaults && storageDefaults, 'не удалось прочитать параметры сжатия по умолчанию');
  assert.ok(
    Number(duplicateDefaults[1]) < Number(storageDefaults[1]),
    'копия для ContentEntry должна быть меньше по стороне, чем копия в Session.photos',
  );
});

test('ContentINKAScreen сохраняет копию фото через downsizeForContentDuplicate, а не downsizeForStorage', () => {
  assert.match(screen, /import \{ downsizePhotosSequentially, downsizeForContentDuplicate \} from '\.\.\/\.\.\/lib\/imagePreview';/);
  assert.doesNotMatch(screen, /downsizeForStorage/);
  const handleGenerate = screen.slice(screen.indexOf('const handleGenerate = async () => {'), screen.indexOf('const regenerate ='));
  assert.match(handleGenerate, /downsizePhotosSequentially\(rawPhotos, photoIds, \(photo\) => downsizeForContentDuplicate\(photo\)\.catch\(\(\) => photo\)\)/);
});
