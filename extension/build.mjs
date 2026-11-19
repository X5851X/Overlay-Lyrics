import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  target: 'chrome111',
  loader: { '.css': 'text', '.lrc': 'text' },
  legalComments: 'none',
  logLevel: 'info',
  sourcemap: watch ? 'inline' : false,
};

const targets = [
  { entryPoints: ['src/background.ts'], outfile: 'dist/background.js', format: 'esm' },
  { entryPoints: ['src/content.ts'], outfile: 'dist/content.js', format: 'iife' },
  { entryPoints: ['src/page.ts'], outfile: 'dist/page.js', format: 'iife' },
  { entryPoints: ['demo/demo.ts'], outfile: 'demo/demo.js', format: 'iife' },
].map((target) => ({ ...common, ...target }));

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

// Versi extension diambil dari package.json supaya cukup diubah di satu tempat.
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
manifest.version = pkg.version;
await writeFile('dist/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

if (watch) {
  for (const target of targets) {
    const ctx = await context(target);
    await ctx.watch();
  }
} else {
  await Promise.all(targets.map((target) => build(target)));
}
