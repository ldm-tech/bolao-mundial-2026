import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { mapeiaJogo, STAGE_PARA_FASE } from '../src/livescore.js';

// ---------- mapeiaJogo: funcao pura, sem banco ----------
const indice = new Map([
  ['grupos|br-ma', { numero: 6, homeCode: 'br' }], // Brasil(casa) x Marrocos
]);
const match = (over = {}) => ({
  stage: 'GROUP_STAGE',
  status: 'IN_PLAY',
  homeTeam: { tla: 'BRA' },
  awayTeam: { tla: 'MAR' },
  score: { fullTime: { home: 2, away: 1 } },
  ...over,
});

test('mapeiaJogo: casa por tla + fase e orienta pelo nosso mando', () => {
  assert.deepEqual(mapeiaJogo(match(), indice), {
    numero: 6,
    gols_casa: 2,
    gols_fora: 1,
    status: 'IN_PLAY',
  });
});

test('mapeiaJogo: mando invertido na API troca os gols', () => {
  const r = mapeiaJogo(
    match({ homeTeam: { tla: 'MAR' }, awayTeam: { tla: 'BRA' } }),
    indice,
  );
  assert.deepEqual(r, { numero: 6, gols_casa: 1, gols_fora: 2, status: 'IN_PLAY' });
});

test('mapeiaJogo: placar nulo (nao comecou) retorna null', () => {
  assert.equal(mapeiaJogo(match({ score: { fullTime: { home: null, away: null } } }), indice), null);
});

test('mapeiaJogo: confronto nao mapeado retorna null', () => {
  assert.equal(mapeiaJogo(match({ awayTeam: { tla: 'ARG' } }), indice), null);
});

test('mapeiaJogo: stage desconhecida retorna null', () => {
  assert.equal(mapeiaJogo(match({ stage: 'PRELIMINARY' }), indice), null);
});

test('STAGE_PARA_FASE cobre o mata-mata da Copa', () => {
  assert.equal(STAGE_PARA_FASE.LAST_32, '1/16');
  assert.equal(STAGE_PARA_FASE.LAST_16, 'oitavas');
  assert.equal(STAGE_PARA_FASE.FINAL, 'final');
});

// ---------- integracao: sincroniza + resultado efetivo ----------
const DB = join(tmpdir(), `bolao_live_test_${process.pid}.db`);
process.env.BOLAO_DB = DB;
// remove qualquer banco temporario remanescente de execucoes anteriores
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) rmSync(f, { force: true });
let getDb;
let sincroniza;
let resultadosEfetivos;

before(async () => {
  ({ getDb } = await import('../src/db.js'));
  ({ sincroniza } = await import('../src/livescore.js'));
  ({ resultadosEfetivos } = await import('../src/ranking.js'));
  const db = getDb();
  db.exec(`
    INSERT INTO jogos (numero, fase, time_casa, time_fora) VALUES
      (6, 'grupos', 'Brasil', 'Marrocos'),
      (1, 'grupos', 'México', 'África do Sul');
  `);
});

after(() => {
  try { getDb().close(); } catch { /* ja fechado */ }
  rmSync(DB, { force: true });
  rmSync(`${DB}-wal`, { force: true });
  rmSync(`${DB}-shm`, { force: true });
});

const fakeFetch = (matches) => async () => ({ ok: true, json: async () => ({ matches }) });

test('sincroniza grava o placar ao vivo dos jogos de grupo', async () => {
  const db = getDb();
  const n = await sincroniza(db, 'token', fakeFetch([match({ score: { fullTime: { home: 3, away: 0 } } })]));
  assert.equal(n, 1);
  const r = db.prepare('SELECT * FROM resultados_ao_vivo WHERE jogo_numero = 6').get();
  assert.equal(r.gols_casa, 3);
  assert.equal(r.gols_fora, 0);
  assert.equal(r.status, 'IN_PLAY');
});

test('resultado efetivo: ao vivo aparece quando nao ha manual', () => {
  const efetivos = resultadosEfetivos(getDb());
  const j6 = efetivos.get(6);
  assert.equal(j6.gols_casa, 3);
  assert.equal(j6.fonte, 'ao_vivo');
});

test('resultado efetivo: manual sobrepoe o ao vivo', () => {
  const db = getDb();
  db.prepare('INSERT INTO resultados (jogo_numero, gols_casa, gols_fora) VALUES (6, 1, 1)').run();
  const j6 = resultadosEfetivos(db).get(6);
  assert.equal(j6.gols_casa, 1);
  assert.equal(j6.gols_fora, 1);
  assert.equal(j6.fonte, 'manual');
});
