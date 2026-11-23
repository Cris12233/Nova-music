import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'www');
const files = [
  'index.html',
  'styles.css',
  'app.js',
  'audio-metadata.js',
  'config.js'
];

await mkdir(output, { recursive: true });

for (const file of files) {
  await copyFile(resolve(root, file), resolve(output, file));
}

console.log('NOVA MUSIC web files copied to www/.');
