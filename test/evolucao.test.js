import { test } from 'node:test';
import assert from 'node:assert/strict';

test('evolucaoFixados: serie acumulada por jogo computado, so dos ids pedidos', async () => {
  process.env.BOLAO_DB = ':memory:';
  const { getDb } = await import('../src/db.js');
  const { evolucaoFixados } = await import('../src/ranking.js');
  const db = getDb();
  db.prepare("INSERT INTO jogos (numero, fase, time_casa, time_fora) VALUES (1,'grupos','A','B'),(2,'grupos','C','D'),(3,'grupos','E','F')").run();
  db.prepare("INSERT INTO jogadores (id, nome) VALUES (1,'Ana'),(2,'Bruno')").run();
  // palpites
  db.prepare('INSERT INTO palpites (jogador_id, jogo_numero, gols_casa, gols_fora) VALUES (?,?,?,?)').run(1, 1, 2, 1); // Ana j1 crava
  db.prepare('INSERT INTO palpites (jogador_id, jogo_numero, gols_casa, gols_fora) VALUES (?,?,?,?)').run(1, 2, 0, 0); // Ana j2 crava
  db.prepare('INSERT INTO palpites (jogador_id, jogo_numero, gols_casa, gols_fora) VALUES (?,?,?,?)').run(2, 1, 1, 0); // Bruno j1 so resultado
  db.prepare('INSERT INTO palpites (jogador_id, jogo_numero, gols_casa, gols_fora) VALUES (?,?,?,?)').run(2, 2, 0, 0); // Bruno j2 crava
  // resultados (jogos 1 e 2 computados; jogo 3 sem resultado)
  db.prepare('INSERT INTO resultados (jogo_numero, gols_casa, gols_fora, atualizado_em) VALUES (1,2,1,?)').run('x');
  db.prepare('INSERT INTO resultados (jogo_numero, gols_casa, gols_fora, atualizado_em) VALUES (2,0,0,?)').run('x');

  const r = evolucaoFixados(db, [1, 2]);
  assert.deepEqual(r.jogos.map((j) => j.numero), [1, 2]); // so os computados
  const ana = r.series.find((s) => s.id === 1);
  const bruno = r.series.find((s) => s.id === 2);
  assert.deepEqual(ana.acum, [35, 70]); // crava + crava
  assert.deepEqual(bruno.acum, [10, 45]); // resultado(10) -> +crava(35)
  // Ana sempre na frente (mais pontos) -> 1º; Bruno -> 2º
  assert.deepEqual(ana.pos, [1, 1]);
  assert.deepEqual(bruno.pos, [2, 2]);
  assert.equal(r.total, 2);
});

test('evolucaoFixados: sem ids -> vazio', async () => {
  process.env.BOLAO_DB = ':memory:';
  const { getDb } = await import('../src/db.js');
  const { evolucaoFixados } = await import('../src/ranking.js');
  assert.deepEqual(evolucaoFixados(getDb(), []), { jogos: [], series: [], total: 0 });
});
