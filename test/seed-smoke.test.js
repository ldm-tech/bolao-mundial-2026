// Smoke test do seed de exemplo.
// Banco vazio (:memory:) -> roda runSeed() -> verifica contagens e ranking.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Banco isolado em memória para o teste
process.env.BOLAO_DB = ':memory:';

let db, rankingCompleto;

before(async () => {
  // Importa depois de definir BOLAO_DB para que getDb() use :memory:
  const { getDb } = await import('../src/db.js');
  const { runSeed } = await import('../scripts/seed.js');
  const rankingMod = await import('../src/ranking.js');
  rankingCompleto = rankingMod.rankingCompleto;

  db = getDb();
  runSeed(db);
});

after(() => {
  try { db.close(); } catch { /* já fechado */ }
});

test('seed: 104 jogos carregados', () => {
  const { c } = db.prepare('SELECT COUNT(*) c FROM jogos').get();
  assert.equal(c, 104);
});

test('seed: 8 participantes fictícios', () => {
  const { c } = db.prepare('SELECT COUNT(*) c FROM jogadores').get();
  assert.equal(c, 8);
});

test('seed: nomes claramente fictícios (sem PII)', () => {
  const nomes = db.prepare('SELECT nome FROM jogadores').all().map((r) => r.nome);
  const sufixosFicticios = ['Exemplo', 'Demo', 'Teste', 'Mock', 'Sample', 'Fake', 'Placeholder'];
  for (const nome of nomes) {
    const ehFicticio = sufixosFicticios.some((s) => nome.includes(s));
    assert.ok(ehFicticio, `Nome "${nome}" nao parece ficticio`);
  }
});

test('seed: palpites de grupos presentes (8 * 72 = 576)', () => {
  const { c } = db.prepare('SELECT COUNT(*) c FROM palpites').get();
  assert.ok(c > 0, 'Deveria haver palpites');
  assert.equal(c, 576, `Esperado 576 palpites (8 x 72 jogos de grupo), got ${c}`);
});

test('seed: especiais presentes para todos os participantes', () => {
  const { c } = db.prepare('SELECT COUNT(*) c FROM palpites_especiais').get();
  assert.equal(c, 8);
  const semCampeao = db
    .prepare('SELECT COUNT(*) c FROM palpites_especiais WHERE campeao IS NULL')
    .get().c;
  assert.equal(semCampeao, 0, 'Todo participante deve ter campeão preenchido');
});

test('seed: resultados de exemplo carregados (primeiras rodadas)', () => {
  const { c } = db.prepare('SELECT COUNT(*) c FROM resultados').get();
  assert.ok(c > 0, 'Deveria haver resultados de exemplo');
  assert.equal(c, 12, `Esperado 12 resultados de exemplo, got ${c}`);
});

test('seed: ranking retorna lista não-vazia com pontuações positivas', () => {
  const { geral } = rankingCompleto(db);
  assert.ok(Array.isArray(geral), 'rankingCompleto deve retornar { geral: [...] }');
  assert.equal(geral.length, 8, 'Deve ter 8 participantes no ranking');
  // Com 12 resultados lançados e palpites variados, pelo menos alguém deve pontuar
  const comPontos = geral.filter((l) => l.total > 0);
  assert.ok(comPontos.length > 0, 'Ao menos um participante deve ter pontuação positiva');
  // Posições devem estar definidas
  for (const l of geral) {
    assert.ok(l.posicao >= 1, `Posicao invalida: ${l.posicao}`);
    assert.ok(typeof l.total === 'number', 'total deve ser número');
  }
});

test('seed: ranking tem variação (nem todos empatados no mesmo total)', () => {
  const { geral } = rankingCompleto(db);
  const totais = new Set(geral.map((l) => l.total));
  assert.ok(totais.size > 1, 'Esperado variação de pontuação entre participantes');
});

test('seed: idempotente — rodar novamente não duplica dados', async () => {
  // Importa de novo (mesmo módulo, já cacheado)
  const { runSeed } = await import('../scripts/seed.js');
  runSeed(db);
  const jogadores = db.prepare('SELECT COUNT(*) c FROM jogadores').get().c;
  const jogos     = db.prepare('SELECT COUNT(*) c FROM jogos').get().c;
  const palpites  = db.prepare('SELECT COUNT(*) c FROM palpites').get().c;
  assert.equal(jogadores, 8,   'Nao deve duplicar jogadores');
  assert.equal(jogos,    104,  'Nao deve duplicar jogos');
  assert.equal(palpites, 576,  'Nao deve duplicar palpites');
});
