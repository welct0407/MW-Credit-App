import { defineConfig } from 'vite';
export default defineConfig(({ mode }) => {
  if (!['synthetic', 'live-dev'].includes(mode)) throw new Error('Choose an explicit synthetic or live-dev build mode');
  return {
    plugins: [{
      name: 'isolated-app-entry',
      transformIndexHtml: { order: 'pre', handler: html => mode === 'live-dev' ? html.replace('/apps/pwa/src/main.tsx', '/apps/pwa/src/live-main.tsx') : html },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'build-mode.json', source: JSON.stringify({ schemaVersion: 1, mode }) + '\n' });
      },
    }],
    build: { outDir: mode === 'live-dev' ? 'dist-live-dev' : 'dist' },
  };
});
