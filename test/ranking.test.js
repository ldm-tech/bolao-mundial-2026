import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

// banco temporario isolado para o teste
const DB = join(tmpdir(), `bolao_ranking_test_${process.pid}.db`);
process.env.BOLAO_DB = DB;

let getDb, rankingGeral, detalheJogador;

before(async () => {
  ({ getDb } = await import('../src/db.js'));
  ({ rankingGeral, detalheJogador } = await import('../src/ranking.js'));
  const db = getDb();
  // 2 jogos de grupos + 1 de mata-mata (1/16)
  db.exec(`
    INSERT INTO jogos (numero, fase, time_casa, time_fora) VALUES
      (1, 'grupos', 'Brasil', 'Chile'),
      (2, 'grupos', 'França', 'Egito'),
      (73, '1/16', NULL, NULL);
    INSERT INTO jogadores (id, nome) VALUES (1, 'Ana'), (2, 'Beto');
  `);
  const palp = db.prepare(
    'INSERT INTO palpites (jogador_id, jogo_numero, gols_casa, gols_fora, time_casa, time_fora) VALUES (?,?,?,?,?,?)',
  );
  // Ana acerta o placar exato do jogo 1 e a chave do 73
  palp.run(1, 1, 2, 0, 'Brasil', 'Chile');
  palp.run(1, 2, 1, 1, 'França', 'Egito');
  palp.run(1, 73, 1, 0, 'Brasil', 'Argentina');
  // Beto erra tudo
  palp.run(2, 1, 0, 3, 'Brasil', 'Chile');
  palp.run(2, 2, 0, 0, 'França', 'Egito');
  palp.run(2, 73, 2, 2, 'Uruguai', 'Colômbia');
});

after(() => {
  try {
    getDb().close(); // libera o arquivo no Windows antes de apagar
  } catch {
    // ja fechado
  }
  rmSync(DB, { force: true });
  rmSync(`${DB}-wal`, { force: true });
  rmSync(`${DB}-shm`, { force: true });
});

test('sem resultados, todos zerados', () => {
  const r = rankingGeral();
  assert.equal(r.every((l) => l.total === 0), true);
  assert.equal(r.length, 2);
});

test('jogo de grupos sem placar nao pontua; placar exato vale 35', () => {
  const db = getDb();
  // resultado do jogo 1: Brasil 2 x 0 Chile (Ana acertou exato)
  db.prepare(
    'INSERT INTO resultados (jogo_numero, gols_casa, gols_fora, time_casa, time_fora) VALUES (1,2,0,?,?)',
  ).run('Brasil', 'Chile');
  const r = rankingGeral();
  const ana = r.find((x) => x.nome === 'Ana');
  assert.equal(ana.total, 35); // so o jogo 1 conta; jogo 2 sem resultado = 0
  assert.equal(ana.posicao, 1);
});

test('mata-mata soma placar + bonus de confronto/selecao', () => {
  const db = getDb();
  // jogo 73 real: Brasil 1 x 0 Argentina — Ana acertou placar e a chave inteira
  db.prepare(
    'INSERT INTO resultados (jogo_numero, gols_casa, gols_fora, time_casa, time_fora) VALUES (73,1,0,?,?)',
  ).run('Brasil', 'Argentina');
  const d = detalheJogador(1);
  // jogo 1: 35 (exato) | jogo 73: 35 (exato) + 30 (confronto) + 30 (2 selecoes) = 95
  assert.equal(d.total, 35 + 95);
  assert.equal(d.totalBonus, 60);
  assert.equal(d.totalGrupos, 35); // grupos so conta o jogo 1
});
