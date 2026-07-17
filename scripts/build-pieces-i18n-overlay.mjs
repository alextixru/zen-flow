// Собирает переводы pieces (packages/pieces/**/src/i18n/ru.json) в один оверлей
// packages/server/api/src/assets/pieces-i18n/ru.json — сервер подмешивает его в
// метаданные pieces из реестра, где локали ru нет (апстрим собирал без неё).
// Запуск: npm run build-pieces-i18n (после правок переводов — перегенерить и закоммитить).
import { readFileSync, writeFileSync, mkdirSync, globSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = globSync(
  ['packages/pieces/*/*/src/i18n/ru.json', 'packages/pieces/*/src/i18n/ru.json'],
  { cwd: repoRoot },
).filter((f) => !f.includes('node_modules'));

const overlay = {};
for (const file of files.sort()) {
  const pkgPath = join(repoRoot, file, '..', '..', '..', 'package.json');
  const { name } = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const translations = JSON.parse(readFileSync(join(repoRoot, file), 'utf8'));
  if (Object.keys(translations).length > 0) {
    overlay[name] = translations;
  }
}

const outPath = join(repoRoot, 'packages/server/api/src/assets/pieces-i18n/ru.json');
mkdirSync(dirname(outPath), { recursive: true });
const sorted = Object.fromEntries(Object.keys(overlay).sort().map((k) => [k, overlay[k]]));
writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n');
console.log(`pieces: ${Object.keys(overlay).length}, файл: ${outPath}`);
