import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Banco isolado em arquivo temporário (não :memory: para evitar colisão com outros módulos)
const DB = join(tmpdir(), `bolao_jogos_test_${process.pid}.db`);
process.env.BOLAO_DB = DB;

let getDb, salvaJogo, removeJogo, listaJogos;

before(async () => {
  ({ getDb } = await import('../src/db.js'));
  ({ salvaJogo, removeJogo, listaJogos } = await import('../src/jogos-admin.js'));

  const db = getDb();
  // jogadores para teste de remoção com palpites
  db.prepare("INSERT OR IGNORE INTO jogadores (id, nome) VALUES (1,'Participante Teste')").run();
});

after(() => {
  try { getDb().close(); } catch { /* já fechado */ }
  for (const suf of ['', '-wal', '-shm']) {
    rmSync(`${DB}${suf}`, { force: true });
  }
});

// ---- salvaJogo: criar jogo novo ----

test('cria jogo novo com campos obrigatórios', () => {
  const db = getDb();
  const r = salvaJogo(db, { numero: 1, fase: 'grupos', time_casa: 'Brasil', time_fora: 'México' });
  assert.ok(r.ok, JSON.stringify(r));
  const row = db.prepare('SELECT * FROM jogos WHERE numero = 1').get();
  assert.ok(row, 'jogo deve existir no banco');
  assert.equal(row.numero, 1);
  assert.equal(row.fase, 'grupos');
  assert.equal(row.time_casa, 'Brasil');
  assert.equal(row.time_fora, 'México');
});

test('cria jogo com todos os campos', () => {
  const db = getDb();
  const r = salvaJogo(db, {
    numero: 2,
    fase: 'grupos',
    grupo: 'A',
    data: '2026-06-11',
    hora: '18:00',
    cidade: 'São Paulo',
    pais: 'Brasil',
    time_casa: 'Argentina',
    time_fora: 'Equador',
  });
  assert.ok(r.ok, JSON.stringify(r));
  const row = db.prepare('SELECT * FROM jogos WHERE numero = 2').get();
  assert.equal(row.grupo, 'A');
  assert.equal(row.data, '2026-06-11');
  assert.equal(row.hora, '18:00');
  assert.equal(row.cidade, 'São Paulo');
  assert.equal(row.pais, 'Brasil');
});

// ---- salvaJogo: editar jogo existente (upsert) ----

test('editar jogo existente faz upsert (sobrescreve dados)', () => {
  const db = getDb();
  // cria jogo 3
  salvaJogo(db, { numero: 3, fase: 'grupos', time_casa: 'Alemanha', time_fora: 'França' });
  // edita: muda hora e cidade
  const r = salvaJogo(db, {
    numero: 3,
    fase: 'grupos',
    time_casa: 'Alemanha',
    time_fora: 'França',
    hora: '21:00',
    cidade: 'Berlin',
  });
  assert.ok(r.ok, JSON.stringify(r));
  const row = db.prepare('SELECT * FROM jogos WHERE numero = 3').get();
  assert.equal(row.hora, '21:00');
  assert.equal(row.cidade, 'Berlin');
  // deve haver apenas UMA linha (upsert, não duplicata)
  const count = db.prepare('SELECT COUNT(*) c FROM jogos WHERE numero = 3').get().c;
  assert.equal(count, 1);
});

test('upsert: pode alterar fase de grupos para mata-mata', () => {
  const db = getDb();
  salvaJogo(db, { numero: 65, fase: 'grupos', time_casa: 'A', time_fora: 'B' });
  const r = salvaJogo(db, { numero: 65, fase: 'oitavas' });
  assert.ok(r.ok, JSON.stringify(r));
  const row = db.prepare('SELECT fase FROM jogos WHERE numero = 65').get();
  assert.equal(row.fase, 'oitavas');
});

// ---- salvaJogo: validações ----

test('numero ausente retorna erro', () => {
  const db = getDb();
  const r = salvaJogo(db, { fase: 'grupos', time_casa: 'Brasil', time_fora: 'México' });
  assert.ok(!r.ok);
  assert.ok(r.erro && r.erro.length > 0);
});

test('numero zero retorna erro', () => {
  const db = getDb();
  const r = salvaJogo(db, { numero: 0, fase: 'grupos' });
  assert.ok(!r.ok);
});

test('fase ausente retorna erro', () => {
  const db = getDb();
  const r = salvaJogo(db, { numero: 99 });
  assert.ok(!r.ok);
  assert.ok(r.erro && r.erro.length > 0);
});

test('campos opcionais vazios viram null (não string vazia)', () => {
  const db = getDb();
  const r = salvaJogo(db, {
    numero: 10,
    fase: 'grupos',
    grupo: '',
    data: '  ',
    hora: null,
    cidade: undefined,
    time_casa: '',
    time_fora: '',
  });
  assert.ok(r.ok, JSON.stringify(r));
  const row = db.prepare('SELECT * FROM jogos WHERE numero = 10').get();
  assert.equal(row.grupo, null);
  assert.equal(row.data, null);
  assert.equal(row.hora, null);
  assert.equal(row.cidade, null);
  assert.equal(row.time_casa, null);
  assert.equal(row.time_fora, null);
});

// ---- removeJogo ----

test('remove jogo sem dependências', () => {
  const db = getDb();
  salvaJogo(db, { numero: 20, fase: 'grupos', time_casa: 'X', time_fora: 'Y' });
  const r = removeJogo(db, 20);
  assert.ok(r.ok, JSON.stringify(r));
  const row = db.prepare('SELECT numero FROM jogos WHERE numero = 20').get();
  assert.equal(row, undefined);
});

test('remove jogo apaga palpites (cascade manual)', () => {
  const db = getDb();
  salvaJogo(db, { numero: 30, fase: 'grupos', time_casa: 'A', time_fora: 'B' });
  // insere palpite
  db.prepare('INSERT OR IGNORE INTO palpites (jogador_id, jogo_numero, gols_casa, gols_fora) VALUES (1,30,2,1)').run();
  assert.equal(db.prepare('SELECT COUNT(*) c FROM palpites WHERE jogo_numero=30').get().c, 1);

  const r = removeJogo(db, 30);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(db.prepare('SELECT COUNT(*) c FROM palpites WHERE jogo_numero=30').get().c, 0);
  assert.equal(db.prepare('SELECT numero FROM jogos WHERE numero=30').get(), undefined);
});

test('remove jogo apaga resultado e palpites (cascade manual em transação)', () => {
  const db = getDb();
  salvaJogo(db, { numero: 31, fase: 'grupos', time_casa: 'C', time_fora: 'D' });
  db.prepare('INSERT OR IGNORE INTO palpites (jogador_id, jogo_numero, gols_casa, gols_fora) VALUES (1,31,0,0)').run();
  db.prepare(`INSERT OR IGNORE INTO resultados (jogo_numero, gols_casa, gols_fora, atualizado_em)
    VALUES (31, 1, 0, '2026-06-11T00:00:00Z')`).run();

  const r = removeJogo(db, 31);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(db.prepare('SELECT COUNT(*) c FROM palpites WHERE jogo_numero=31').get().c, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM resultados WHERE jogo_numero=31').get().c, 0);
  assert.equal(db.prepare('SELECT numero FROM jogos WHERE numero=31').get(), undefined);
});

test('remover jogo inexistente retorna erro', () => {
  const db = getDb();
  const r = removeJogo(db, 999999);
  assert.ok(!r.ok);
  assert.ok(r.erro && r.erro.length > 0);
});

test('numero inválido em removeJogo retorna erro', () => {
  const db = getDb();
  const r = removeJogo(db, 'abc');
  assert.ok(!r.ok);
});

// ---- listaJogos ----

test('listaJogos retorna todos os jogos ordenados por número', () => {
  const db = getDb();
  // cria dois jogos fora de ordem
  salvaJogo(db, { numero: 50, fase: 'grupos', time_casa: 'P', time_fora: 'Q' });
  salvaJogo(db, { numero: 40, fase: 'grupos', time_casa: 'R', time_fora: 'S' });
  const lista = listaJogos(db);
  assert.ok(lista.length >= 2);
  // verifica ordenação crescente
  for (let i = 1; i < lista.length; i++) {
    assert.ok(lista[i - 1].numero <= lista[i].numero,
      `Fora de ordem: ${lista[i-1].numero} > ${lista[i].numero}`);
  }
});

test('listaJogos retorna array e objeto com campos esperados', () => {
  const db = getDb();
  // cria jogo com todos os campos para verificar estrutura retornada
  salvaJogo(db, {
    numero: 60,
    fase: 'oitavas',
    grupo: null,
    data: '2026-07-01',
    hora: '16:00',
    cidade: 'Curitiba',
    pais: 'Brasil',
    time_casa: 'Espanha',
    time_fora: 'Alemanha',
  });
  const lista = listaJogos(db);
  assert.ok(Array.isArray(lista));
  const jogo = lista.find((j) => j.numero === 60);
  assert.ok(jogo, 'jogo 60 deve estar na lista');
  assert.equal(jogo.fase, 'oitavas');
  assert.equal(jogo.cidade, 'Curitiba');
  assert.equal(jogo.time_casa, 'Espanha');
  assert.equal(jogo.time_fora, 'Alemanha');
});
