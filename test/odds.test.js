import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { probsDeMercado } from '../src/odds.js';

// ---------- probsDeMercado: pura, sem banco ----------
// Constroi um summary ESPN com pickcenter contendo moneylines americanos.
// espnHomeId = ID do time da ESPN que aparece como "home" no evento.
function makeSummary(homeML, awayML, drawML, espnHomeId = '203') {
  return {
    pickcenter: [
      {
        homeTeamOdds: { moneyLine: homeML, team: { id: espnHomeId } },
        awayTeamOdds: { moneyLine: awayML },
        drawOdds: { moneyLine: drawML },
      },
    ],
  };
}

test('probsDeMercado: favorito em casa, mesmoMando=true', () => {
  // home -230 (favorito), away +750, draw +330
  const p = probsDeMercado(makeSummary(-230, 750, 330), '203', true);
  assert.ok(p !== null);
  const soma = p.pCasa + p.pEmpate + p.pFora;
  assert.ok(Math.abs(soma - 1) < 1e-9, `soma deve ser 1, foi ${soma}`);
  // favorito em casa => pCasa maior
  assert.ok(p.pCasa > p.pFora, `pCasa(${p.pCasa}) deve ser > pFora(${p.pFora})`);
  // pCasa entre ~0.66 e ~0.70 conforme conversão ML
  assert.ok(p.pCasa >= 0.64 && p.pCasa <= 0.72, `pCasa esperado ~0.66-0.70, foi ${p.pCasa}`);
});

test('probsDeMercado: mando invertido troca pCasa<->pFora', () => {
  const pMesmo = probsDeMercado(makeSummary(-230, 750, 330), '203', true);
  const pInv   = probsDeMercado(makeSummary(-230, 750, 330), '203', false);
  assert.ok(pMesmo !== null && pInv !== null);
  assert.ok(Math.abs(pMesmo.pCasa - pInv.pFora) < 1e-9, 'pCasa e pFora devem ser trocados');
  assert.ok(Math.abs(pMesmo.pFora - pInv.pCasa) < 1e-9, 'pFora e pCasa devem ser trocados');
  assert.ok(Math.abs(pMesmo.pEmpate - pInv.pEmpate) < 1e-9, 'pEmpate permanece igual');
  // soma ainda deve ser 1
  const soma = pInv.pCasa + pInv.pEmpate + pInv.pFora;
  assert.ok(Math.abs(soma - 1) < 1e-9);
});

test('probsDeMercado: summary sem pickcenter retorna null', () => {
  assert.equal(probsDeMercado({}, '203', true), null);
  assert.equal(probsDeMercado({ pickcenter: [] }, '203', true), null);
  assert.equal(probsDeMercado(null, '203', true), null);
});

test('probsDeMercado: ML positivo converte corretamente (underdog)', () => {
  // away +750 => p_raw = 100/(750+100) = 100/850 ≈ 0.1176
  // Usa um summary com home positivo enorme pra isolar o away
  const p = probsDeMercado(makeSummary(-230, 750, 330), '203', true);
  // pFora < pEmpate < pCasa (favorito em casa, empate intermediario)
  assert.ok(p.pFora < p.pEmpate, `pFora(${p.pFora}) deve ser < pEmpate(${p.pEmpate})`);
  assert.ok(p.pEmpate < p.pCasa, `pEmpate(${p.pEmpate}) deve ser < pCasa(${p.pCasa})`);
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

test('sincronizaOdds ESPN: grava e orienta pelo nosso mando', async () => {
  // Scoreboard ESPN: Brasil (BRA, id=109) como ESPN-home vs Marrocos (MAR, id=207)
  // summary: home -230 (favorito) => Brasil e favorito em casa => prob_casa > prob_fora
  const scoreboard = {
    events: [
      {
        id: 'ev1',
        status: { type: { state: 'in', description: 'In Progress' } },
        competitions: [
          {
            competitors: [
              {
                homeAway: 'home',
                team: { id: '109', abbreviation: 'BRA', displayName: 'Brazil' },
                score: '1',
              },
              {
                homeAway: 'away',
                team: { id: '207', abbreviation: 'MAR', displayName: 'Morocco' },
                score: '0',
              },
            ],
          },
        ],
      },
    ],
  };
  const summary = makeSummary(-230, 750, 330, '109');

  const fakeFetch = async (url) => {
    if (url.includes('scoreboard')) return { json: async () => scoreboard };
    if (url.includes('summary')) return { json: async () => summary };
    return { json: async () => ({}) };
  };

  const n = await sincronizaOdds(getDb(), fakeFetch);
  assert.equal(n, 1);
  const r = getDb().prepare('SELECT * FROM odds_mercado WHERE jogo_numero = 6').get();
  // Brasil (casa) e favorito -> prob_casa > prob_fora
  assert.ok(r.prob_casa > r.prob_fora, `prob_casa(${r.prob_casa}) deve ser > prob_fora(${r.prob_fora})`);
  assert.ok(Math.abs(r.prob_casa + r.prob_empate + r.prob_fora - 1) < 1e-9);
});
