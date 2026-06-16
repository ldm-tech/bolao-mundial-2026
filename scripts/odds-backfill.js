// Backfill manual de odds de mercado para jogos passados (a the-odds-api nao
// devolve historico). Voce informa as odds DECIMAIS de fechamento (1x2) de cada
// jogo; o script remove a margem (vig), normaliza para somar 1 e grava em
// odds_mercado — exatamente como o app faz com as odds ao vivo.
//
// Uso:  node scripts/odds-backfill.js [caminho-do-json]
//   (default: data/odds-backfill.json; no container use /data/odds-backfill.json)
//
// Formato do JSON:  { "<numero_do_jogo>": [casa, empate, fora], ... }
//   ex.:  { "1": [1.20, 6.50, 13.0], "2": [2.40, 3.10, 3.00] }
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb } from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const caminho = process.argv[2] || join(__dirname, '..', 'data', 'odds-backfill.json');
const dados = JSON.parse(readFileSync(caminho, 'utf-8'));
const db = getDb();

const upsert = db.prepare(`
  INSERT INTO odds_mercado (jogo_numero, prob_casa, prob_empate, prob_fora, atualizado_em)
  VALUES (@numero, @casa, @empate, @fora, @em)
  ON CONFLICT(jogo_numero) DO UPDATE SET
    prob_casa=excluded.prob_casa, prob_empate=excluded.prob_empate,
    prob_fora=excluded.prob_fora, atualizado_em=excluded.atualizado_em`);

const agora = new Date().toISOString();
let ok = 0;
for (const [numero, odds] of Object.entries(dados)) {
  const [oc, oe, of_] = (odds || []).map(Number);
  if (!(oc > 1) || !(oe > 1) || !(of_ > 1)) {
    console.warn(`Jogo ${numero}: odds invalidas (${JSON.stringify(odds)}) — pulando.`);
    continue;
  }
  // probabilidade implicita de cada odd, normalizada para somar 1 (tira a vig)
  const ic = 1 / oc;
  const ie = 1 / oe;
  const ifa = 1 / of_;
  const s = ic + ie + ifa;
  upsert.run({ numero: Number(numero), casa: ic / s, empate: ie / s, fora: ifa / s, em: agora });
  ok += 1;
}
console.log(`Odds de mercado gravadas/atualizadas: ${ok} jogo(s).`);
