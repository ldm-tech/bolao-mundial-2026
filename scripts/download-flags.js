// Baixa as bandeiras (SVG) das 48 selecoes do flagcdn para public/flags/.
// Roda uma vez; os arquivos sao versionados. Reutilizavel (sobrescreve).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CODIGOS } from '../src/flags.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'flags');
mkdirSync(OUT, { recursive: true });

const unicos = [...new Set(CODIGOS)];
let ok = 0;
const falhas = [];

for (const code of unicos) {
  const url = `https://flagcdn.com/${code}.svg`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const svg = await resp.text();
    if (!svg.includes('<svg')) throw new Error('conteudo nao parece SVG');
    writeFileSync(join(OUT, `${code}.svg`), svg, 'utf-8');
    ok += 1;
  } catch (e) {
    falhas.push(`${code}: ${e.message}`);
  }
}

console.log(`Bandeiras baixadas: ${ok}/${unicos.length}`);
if (falhas.length) {
  console.log('Falhas:');
  for (const f of falhas) console.log('  ' + f);
  process.exit(1);
}
