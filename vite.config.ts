import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
export default defineConfig(({ mode }) => {
  if (!['synthetic', 'live-dev'].includes(mode)) throw new Error('Choose an explicit synthetic or live-dev build mode');
  return {
    // The dependency scanner reads raw HTML, before our mode-specific HTML transform.
    // Scan the actual entry so a cold live server discovers Firebase before browser loads.
    optimizeDeps: {
      entries: [mode === 'live-dev' ? 'apps/pwa/src/live-main.tsx' : 'apps/pwa/src/main.tsx'],
      include: mode === 'live-dev' ? ['firebase/app', 'firebase/auth'] : [],
    },
    plugins: [{
      name: 'isolated-app-entry',
      transformIndexHtml: { order: 'pre', handler: html => mode === 'live-dev' ? html.replace('/apps/pwa/src/main.tsx', '/apps/pwa/src/live-main.tsx') : html },
      generateBundle(_options, bundle) {
        if (mode === 'live-dev') {
          const paths = ['offline.html', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
          const worker = readFileSync('apps/pwa/pwa/sw.js', 'utf8');
          const hash = createHash('sha256').update(worker);
          for (const name of Object.keys(bundle).sort()) {
            const entry = bundle[name];
            hash.update(name).update(entry.type === 'chunk' ? entry.code : entry.source);
          }
          for (const fileName of paths) {
            const source = readFileSync('apps/pwa/pwa/' + fileName);
            hash.update(source);
            this.emitFile({ type: 'asset', fileName, source });
          }
          const version=hash.digest('hex').slice(0,24);
          const entry=Object.values(bundle).find(value=>value.type==='chunk'&&value.isEntry);
          this.emitFile({type:'asset',fileName:'build-version.json',source:JSON.stringify({schemaVersion:1,version,entry:entry?'/'+entry.fileName:null})});
          this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker.replace('__BUILD_VERSION__', version).replace('/*APP_ASSETS*/[]', JSON.stringify(['/', ...Object.keys(bundle).filter(name => /^assets\//.test(name) && /\.(js|css|png)$/.test(name)).map(name => '/' + name)])) });
          this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify({
            id: '/', start_url: '/', scope: '/', name: 'MW Credit DEV', short_name: 'MW Credit DEV', display: 'standalone',
            theme_color: '#e8710a', background_color: '#ffffff',
            icons: [192, 512].map(size => ({ src: `/icons/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
          }) });
        }
        this.emitFile({ type: 'asset', fileName: 'build-mode.json', source: JSON.stringify({ schemaVersion: 1, mode }) + '\n' });
      },
    }],
    build: { outDir: mode === 'live-dev' ? 'dist-live-dev' : 'dist' },
  };
});
