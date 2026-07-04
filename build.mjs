import { build } from 'esbuild';
import { execSync } from 'child_process';
import { mkdirSync, cpSync, existsSync } from 'fs';

const extDir = 'ext';

// Ensure output directories exist
mkdirSync(`${extDir}/lib`, { recursive: true });
mkdirSync(`${extDir}/options`, { recursive: true });

// Step 1: Compile service worker and shared lib with tsc
console.log('[1/3] Compiling service worker + lib with tsc...');
execSync('npx tsc --project tsconfig.json', { stdio: 'inherit' });

// Step 2: Bundle the options page with esbuild (pulls in lib deps)
console.log('[2/3] Bundling options page with esbuild...');
await build({
  entryPoints: ['src/options/options.ts'],
  bundle: true,
  outfile: `${extDir}/options/options.js`,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
});

// Step 3: Copy static assets (HTML, CSS)
console.log('[3/3] Copying static assets...');
if (existsSync('src/options/options.html')) {
  cpSync('src/options/options.html', `${extDir}/options/options.html`);
}
if (existsSync('src/options/options.css')) {
  cpSync('src/options/options.css', `${extDir}/options/options.css`);
}

console.log('Build complete.');
