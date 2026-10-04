import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/web', { recursive: true });
await build({ entryPoints: ['web/app.ts'], bundle: true, outfile: 'dist/web/app.js', format: 'esm', target: 'es2023', minify: true, sourcemap: false });
await build({ entryPoints: ['web/auth-callback.ts'], bundle: true, outfile: 'dist/web/auth-callback.js', format: 'esm', target: 'es2023', minify: true, sourcemap: false });
await Promise.all(['index.html', 'style.css', 'auth-callback.html'].map(file => copyFile(`web/${file}`, `dist/web/${file}`)));
