import { test } from 'node:test';
import assert from 'node:assert/strict';

// Quando a chave do mata-mata é lançada no admin (times) ANTES de haver placar,
// os times precisam aparecer na tela de jogos. resultadosEfetivos deve devolver
// a linha com time_casa/time_fora mesmo com gols nulos (fonte = 'nenhum').
test('resultadosEfetivos: chave do mata-mata sem placar surge com os times', async () => {
  process.env.BOLAO_DB = ':memory:';
  const { getDb } = await import('../src/db.js');
  const { resultadosEfetivos } = await import('../src/ranking.js');
  const db = getDb();
  db.prepare("INSERT INTO jogos (numero, fase, time_casa, time_fora) VALUES (73,'1/16',NULL,NULL)").run();
  // só os times da chave, sem gols (como o admin grava ao virar a fase)
  db.prepare(
    'INSERT INTO resultados (jogo_numero, time_casa, time_fora, atualizado_em) VALUES (73,?,?,?)',
  ).run('Brasil', 'Croácia', 'x');

  const r = resultadosEfetivos(db).get(73);
  assert.ok(r, 'a linha do jogo 73 deve existir');
  assert.equal(r.time_casa, 'Brasil');
  assert.equal(r.time_fora, 'Croácia');
  assert.equal(r.gols_casa, null);
  assert.equal(r.gols_fora, null);
  assert.equal(r.fonte, 'nenhum');
});
