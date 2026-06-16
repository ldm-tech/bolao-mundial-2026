import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function dbComDoisJogadores() {
  const dir = mkdtempSync(join(tmpdir(), 'bolao-'));
  process.env.BOLAO_DB = join(dir, 't.db');
  const { getDb } = await import('../src/db.js?rank=' + Math.random());
  const db = getDb();
  db.prepare('INSERT INTO jogos (numero, fase, time_casa, time_fora) VALUES (1,?,?,?)')
    .run('grupos', 'Brasil', 'Sérvia');
  db.prepare("INSERT INTO jogadores (nome, chave, nome_exibicao) VALUES ('A','a','A'),('B','b','B')").run();
  const ja = db.prepare("SELECT id FROM jogadores WHERE nome='A'").get().id;
  const jb = db.prepare("SELECT id FROM jogadores WHERE nome='B'").get().id;
  db.prepare('INSERT INTO palpites (jogador_id, jogo_numero, gols_casa, gols_fora) VALUES (?,?,2,0)').run(ja, 1);
  db.prepare('INSERT INTO palpites (jogador_id, jogo_numero, gols_casa, gols_fora) VALUES (?,?,0,1)').run(jb, 1);
  db.prepare('INSERT INTO resultados (jogo_numero, gols_casa, gols_fora) VALUES (1,2,0)').run();
  return { db, dir };
}

test('rankingCompleto.geral bate com rankingGeral; nome_exibicao usado', async () => {
  const { db, dir } = await dbComDoisJogadores();
  const { rankingGeral, rankingCompleto } = await import('../src/ranking.js?rank=' + Math.random());
  const antigo = rankingGeral(db);
  const novo = rankingCompleto(db).geral;
  assert.deepEqual(novo.map((l) => [l.nome, l.total, l.posicao]),
                   antigo.map((l) => [l.nome, l.total, l.posicao]));
  assert.equal(novo[0].nome, 'A'); // A acertou o placar exato (35)
  db.close();
  delete process.env.BOLAO_DB;
  rmSync(dir, { recursive: true, force: true });
});
