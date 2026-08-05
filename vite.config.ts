import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Идентификатор конкретной сборки. Подставляется и в код приложения
// (__BUILD_ID__), и в сервис-воркер, и в /version.json — по нему уже
// запущенное приложение понимает, что на сервере лежит новая версия.
const buildId = Date.now().toString(36);

// Штампует sw.js идентификатором сборки и кладёт рядом version.json.
//
// sw.js генерируется здесь, а не лежит в public/, по двум причинам: файлы из
// public/ копируются в dist как есть (и перезаписали бы сгенерированный), и
// главное — браузер устанавливает новый сервис-воркер только когда байты
// sw.js отличаются от уже установленного. Без штампа каждый деплой отдавал
// побайтово одинаковый файл, и обновление не срабатывало никогда.
function buildStamp(): Plugin {
  return {
    name: 'inka-build-stamp',
    apply: 'build',
    generateBundle() {
      const template = readFileSync(fileURLToPath(new URL('./src/sw.template.js', import.meta.url)), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace(/__BUILD_ID__/g, buildId),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), buildStamp()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    target: 'es2020',
  },
  server: {
    port: 5173,
  },
});
