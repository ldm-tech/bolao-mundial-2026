import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

// banco isolado em arquivo temporário (não :memory: para evitar conflito de módulo)
const DB = join(tmpdir(), `bolao_partic_test_${process.pid}.db`);
process.env.BOLAO_DB = DB;

let getDb, criaParticipante, editaParticipante, removeParticipante, listaParticipantes;

before(async () => {
  ({ getDb } = await import('../src/db.js'));
  ({
    criaParticipante,
    editaParticipante,
    removeParticipante,
    listaParticipantes,
  } = await import('../src/participantes.js'));
});

after(() => {
  try { getDb().close(); } catch { /* já fechado */ }
  for (const suf of ['', '-wal', '-shm']) {
    rmSync(`${DB}${suf}`, { force: true });
  }
});

// ---- criar ----

test('cria participante com nome válido', () => {
  const db = getDb();
  const r = criaParticipante(db, { nome: 'Alice' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(r.id > 0);
});

test('cria participante: contatos opcionais ficam null', () => {
  const db = getDb();
  const r = criaParticipante(db, { nome: 'Bob' });
  assert.ok(r.ok);
  const row = db.prepare('SELECT * FROM jogadores WHERE id = ?').get(r.id);
  assert.equal(row.email, null);
  assert.equal(row.whatsapp, null);
  assert.equal(row.nome_exibicao, null);
});

test('cria participante: nome vazio retorna erro (não cria)', () => {
  const db = getDb();
  const antes = db.prepare('SELECT COUNT(*) c FROM jogadores').get().c;
  const r = criaParticipante(db, { nome: '   ' });
  assert.ok(!r.ok);
  assert.ok(r.erro.length > 0);
  const depois = db.prepare('SELECT COUNT(*) c FROM jogadores').get().c;
  assert.equal(depois, antes); // nenhum novo participante
});

test('cria participante: nome ausente retorna erro', () => {
  const db = getDb();
  const r = criaParticipante(db, {});
  assert.ok(!r.ok);
});

test('cria participante: nome duplicado retorna erro', () => {
  const db = getDb();
  criaParticipante(db, { nome: 'Carlos' });
  const r2 = criaParticipante(db, { nome: 'Carlos' });
  assert.ok(!r2.ok);
  assert.ok(r2.erro.toLowerCase().includes('exist'));
});

test('cria participante com contatos preenchidos', () => {
  const db = getDb();
  const r = criaParticipante(db, {
    nome: 'Diana',
    email: 'diana@example.com',
    whatsapp: '11999990000',
    nome_exibicao: 'Di',
  });
  assert.ok(r.ok);
  const row = db.prepare('SELECT * FROM jogadores WHERE id = ?').get(r.id);
  assert.equal(row.email, 'diana@example.com');
  assert.equal(row.whatsapp, '11999990000');
  assert.equal(row.nome_exibicao, 'Di');
});

// ---- editar ----

test('edita participante existente', () => {
  const db = getDb();
  const { id } = criaParticipante(db, { nome: 'Eduardo' });
  assert.ok(id);
  const r = editaParticipante(db, id, { nome: 'Eduardo Lima', email: 'edu@example.com', pago: true });
  assert.ok(r.ok, JSON.stringify(r));
  const row = db.prepare('SELECT * FROM jogadores WHERE id = ?').get(id);
  assert.equal(row.nome, 'Eduardo Lima');
  assert.equal(row.email, 'edu@example.com');
  assert.equal(row.pago, 1);
});

test('editar com nome vazio retorna erro e não altera', () => {
  const db = getDb();
  const { id } = criaParticipante(db, { nome: 'Fausto' });
  assert.ok(id);
  const r = editaParticipante(db, id, { nome: '' });
  assert.ok(!r.ok);
  const row = db.prepare('SELECT nome FROM jogadores WHERE id = ?').get(id);
  assert.equal(row.nome, 'Fausto'); // não alterou
});

test('editar id inexistente retorna erro', () => {
  const db = getDb();
  const r = editaParticipante(db, 999999, { nome: 'Fantasma' });
  assert.ok(!r.ok);
});

// ---- remover ----

test('remove participante sem palpites', () => {
  const db = getDb();
  const { id } = criaParticipante(db, { nome: 'Guilherme' });
  assert.ok(id);
  const r = removeParticipante(db, id);
  assert.ok(r.ok);
  const row = db.prepare('SELECT id FROM jogadores WHERE id = ?').get(id);
  assert.equal(row, undefined);
});

test('remove participante apaga palpites e palpites_especiais (cascade manual)', () => {
  const db = getDb();
  // insere jogo e participante
  db.prepare("INSERT OR IGNORE INTO jogos (numero, fase, time_casa, time_fora) VALUES (1,'grupos','Brasil','Alemanha')").run();
  const { id } = criaParticipante(db, { nome: 'Helena' });
  assert.ok(id);
  // insere palpite e palpite especial
  db.prepare('INSERT INTO palpites (jogador_id, jogo_numero, gols_casa, gols_fora) VALUES (?,1,1,0)').run(id);
  db.prepare('INSERT OR IGNORE INTO palpites_especiais (jogador_id, artilheiro, campeao) VALUES (?,?,?)').run(id, 'Neymar', 'Brasil');

  const r = removeParticipante(db, id);
  assert.ok(r.ok);

  const palp = db.prepare('SELECT * FROM palpites WHERE jogador_id = ?').all(id);
  assert.equal(palp.length, 0);
  const esp = db.prepare('SELECT * FROM palpites_especiais WHERE jogador_id = ?').all(id);
  assert.equal(esp.length, 0);
  const jog = db.prepare('SELECT id FROM jogadores WHERE id = ?').get(id);
  assert.equal(jog, undefined);
});

test('remover id inexistente retorna erro', () => {
  const db = getDb();
  const r = removeParticipante(db, 999999);
  assert.ok(!r.ok);
});

// ---- listar ----

test('listaParticipantes retorna todos ordenados por nome', () => {
  const db = getDb();
  // Cria dois novos participantes para garantir que há pelo menos 2
  criaParticipante(db, { nome: 'Zuleica' });
  criaParticipante(db, { nome: 'Afonso' });
  const lista = listaParticipantes(db);
  assert.ok(lista.length >= 2);
  // verifica ordenação
  for (let i = 1; i < lista.length; i++) {
    assert.ok(lista[i - 1].nome.localeCompare(lista[i].nome, 'pt-BR', { sensitivity: 'base' }) <= 0);
  }
});

test('listaParticipantes usa nome_exibicao quando preenchido', () => {
  const db = getDb();
  const { id } = criaParticipante(db, { nome: 'IgorSobrenome', nome_exibicao: 'Igor' });
  assert.ok(id);
  const lista = listaParticipantes(db);
  const found = lista.find((p) => p.id === id);
  assert.ok(found);
  assert.equal(found.nome_exib, 'Igor');
});
