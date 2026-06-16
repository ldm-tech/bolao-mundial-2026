import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { probsDeMercado } from '../src/odds.js';

// ---------- probsDeMercado: pura, sem banco ----------
const book = (h, d, a) => ({
  markets: [{ key: 'h2h', outcomes: [
    { name: 'Brazil', price: h }, { name: 'Draw', price: d }, { name: 'Morocco', price: a },
  ] }],
});
const matchOdds = (...books) => ({ home_team: 'Brazil', away_team: 'Morocco', bookmakers: books });

test('probsDeMercado: normaliza (soma 1) e mapeia nomes em ingles', () => {
  const p = probsDeMercado(matchOdds(book(1.5, 4, 7)));
  assert.equal(p.homeCode, 'br');
  assert.equal(p.awayCode, 'ma');
  const soma = p.pHome + p.pDraw + p.pAway;
  assert.ok(Math.abs(soma - 1) < 1e-9, `soma deveria ser 1, foi ${soma}`);
  assert.ok(p.pHome > p.pAway); // favorito tem prob maior
});

test('probsDeMercado: faz a media entre as casas', () => {
  const p = probsDeMercado(matchOdds(book(1.5, 4, 7), book(2.0, 3.5, 4)));
  assert.ok(Math.abs(p.pHome + p.pDraw + p.pAway - 1) < 1e-9);
});

test('probsDeMercado: time desconhecido retorna null', () => {
  assert.equal(probsDeMercado({ home_team: 'Atlantis', away_team: 'Brazil', bookmakers: [] }), null);
});

// ---------- integracao: oddsBolao + sincronizaOdds ----------
const DB = join(tmpdir(), `bolao_odds_test_${process.pid}.db`);
process.env.BOLAO_DB = DB;
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) rmSync(f, { force: true });
let getDb;
let oddsBolao;
let sincronizaOdds;

before(async () => {
  ({ getDb } = await import('../src/db.js'));
  ({ oddsBolao, sincronizaOdds } = await import('../src/odds.js'));
  const db = getDb();
  db.exec("INSERT INTO jogos (numero, fase, time_casa, time_fora) VALUES (6, 'grupos', 'Brasil', 'Marrocos')");
  db.exec('INSERT INTO jogadores (id, nome) VALUES (1,\'A\'),(2,\'B\'),(3,\'C\'),(4,\'D\'),(5,\'E\')');
  const p = db.prepare('INSERT INTO palpites (jogador_id, jogo_numero, gols_casa, gols_fora) VALUES (?,6,?,?)');
  p.run(1, 2, 0); // casa
  p.run(2, 3, 1); // casa
  p.run(3, 1, 0); // casa
  p.run(4, 1, 1); // empate
  p.run(5, 0, 2); // fora
});

after(() => {
  try { getDb().close(); } catch { /* ja fechado */ }
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) rmSync(f, { force: true });
});

test('oddsBolao: conta casa/empate/fora dos palpites', () => {
  const o = oddsBolao(getDb()).get(6);
  assert.deepEqual(o, { casa: 3, empate: 1, fora: 1, total: 5 });
});

test('sincronizaOdds: grava e orienta pelo nosso mando', async () => {
  const fake = async () => ({ ok: true, json: async () => [matchOdds(book(1.5, 4, 7))] });
  const n = await sincronizaOdds(getDb(), 'token', fake);
  assert.equal(n, 1);
  const r = getDb().prepare('SELECT * FROM odds_mercado WHERE jogo_numero = 6').get();
  // Brasil (casa) e favorito -> prob_casa > prob_fora
  assert.ok(r.prob_casa > r.prob_fora);
  assert.ok(Math.abs(r.prob_casa + r.prob_empate + r.prob_fora - 1) < 1e-9);
});
