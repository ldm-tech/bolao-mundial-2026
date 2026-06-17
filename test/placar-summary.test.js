import { test } from 'node:test';
import assert from 'node:assert/strict';

// Regressão: quando a ESPN registra um gol no summary (keyEvents) ANTES de o
// scoreboard atualizar o placar, o placar exibido deve seguir a CONTAGEM de gols
// do summary (consistente com os autores), e não o scoreboard atrasado.
test('sincronizaEspn: placar = contagem de gols do summary (não o scoreboard atrasado)', async () => {
  process.env.BOLAO_DB = ':memory:';
  const { getDb } = await import('../src/db.js');
  const { sincronizaEspn, leDetalhes } = await import('../src/detalhevivo.js');
  const db = getDb();
  db.exec('DELETE FROM resultados_ao_vivo; DELETE FROM config; DELETE FROM jogos;');
  db.prepare("INSERT INTO jogos (numero, fase, time_casa, time_fora) VALUES (1,'grupos','Brasil','Argentina')").run();

  // scoreboard ATRASADO (1x0); summary já com 3 gols (2x1)
  const scoreboard = {
    events: [
      {
        id: 'E1',
        status: { type: { state: 'in', description: 'First Half' }, displayClock: "45'" },
        competitions: [
          {
            competitors: [
              { homeAway: 'home', team: { id: '1', displayName: 'Brasil' }, score: '1' },
              { homeAway: 'away', team: { id: '2', displayName: 'Argentina' }, score: '0' },
            ],
          },
        ],
      },
    ],
  };
  const summary = {
    keyEvents: [
      { scoringPlay: true, clock: { displayValue: "10'" }, team: { id: '1' }, participants: [{ athlete: { displayName: 'A' } }], text: 'Goal! Brazil 1, Argentina 0.' },
      { scoringPlay: true, clock: { displayValue: "20'" }, team: { id: '1' }, participants: [{ athlete: { displayName: 'B' } }], text: 'Goal! Brazil 2, Argentina 0.' },
      { scoringPlay: true, clock: { displayValue: "30'" }, team: { id: '2' }, participants: [{ athlete: { displayName: 'C' } }], text: 'Goal! Brazil 2, Argentina 1.' },
    ],
  };
  const fetchMock = async (url) => ({ json: async () => (String(url).includes('summary') ? summary : scoreboard) });

  await sincronizaEspn(db, fetchMock, '20260611-20260719');

  const r = db.prepare('SELECT gols_casa, gols_fora FROM resultados_ao_vivo WHERE jogo_numero = 1').get();
  assert.equal(r.gols_casa, 2, 'placar casa segue a contagem do summary (2), não o scoreboard (1)');
  assert.equal(r.gols_fora, 1, 'placar fora segue a contagem do summary (1)');

  // e bate com os autores exibidos
  const d = leDetalhes(db)[1];
  assert.equal(d.golsCasa.length, 2);
  assert.equal(d.golsFora.length, 1);
});

// 0x0 sem gols no summary: mantém o scoreboard (não zera indevidamente).
test('sincronizaEspn: 0x0 usa o scoreboard quando o summary não tem gols', async () => {
  process.env.BOLAO_DB = ':memory:';
  const { getDb } = await import('../src/db.js');
  const { sincronizaEspn } = await import('../src/detalhevivo.js');
  const db = getDb();
  db.exec('DELETE FROM resultados_ao_vivo; DELETE FROM config; DELETE FROM jogos;');
  db.prepare("INSERT INTO jogos (numero, fase, time_casa, time_fora) VALUES (1,'grupos','Brasil','Argentina')").run();
  const scoreboard = {
    events: [
      {
        id: 'E1',
        status: { type: { state: 'in', description: 'First Half' }, displayClock: "10'" },
        competitions: [
          {
            competitors: [
              { homeAway: 'home', team: { id: '1', displayName: 'Brasil' }, score: '0' },
              { homeAway: 'away', team: { id: '2', displayName: 'Argentina' }, score: '0' },
            ],
          },
        ],
      },
    ],
  };
  const fetchMock = async (url) => ({ json: async () => (String(url).includes('summary') ? { keyEvents: [] } : scoreboard) });
  await sincronizaEspn(db, fetchMock, '20260611-20260719');
  const r = db.prepare('SELECT gols_casa, gols_fora FROM resultados_ao_vivo WHERE jogo_numero = 1').get();
  assert.equal(r.gols_casa, 0);
  assert.equal(r.gols_fora, 0);
});
