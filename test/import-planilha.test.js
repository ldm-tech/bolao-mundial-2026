/**
 * test/import-planilha.test.js
 *
 * Testa o importador de planilhas (scripts/import-planilha.js).
 * Gera uma planilha pequena em arquivo temporário com exceljs,
 * roda a importação contra um banco isolado e verifica os resultados.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Banco isolado por PID para não colidir com outros testes paralelos
const DB = join(tmpdir(), `bolao_import_planilha_test_${process.pid}.db`);
process.env.BOLAO_DB = DB;

// Arquivo de planilha temporário
const XLSX_TEMP = join(tmpdir(), `planilha_import_test_${process.pid}.xlsx`);

let getDb, importaLinhas, leLinhasPlanilha, ExcelJS;

before(async () => {
  ({ getDb }           = await import('../src/db.js'));
  ({ importaLinhas, leLinhasPlanilha } = await import('../scripts/import-planilha.js'));
  ExcelJS              = (await import('exceljs')).default;

  const db = getDb();

  // Jogos de grupos (1 e 2) e mata-mata (65)
  db.prepare(
    "INSERT OR IGNORE INTO jogos (numero, fase, time_casa, time_fora) VALUES (1,'grupos','Brasil','Alemanha')"
  ).run();
  db.prepare(
    "INSERT OR IGNORE INTO jogos (numero, fase, time_casa, time_fora) VALUES (2,'grupos','Argentina','França')"
  ).run();
  db.prepare(
    "INSERT OR IGNORE INTO jogos (numero, fase) VALUES (65,'oitavas')"
  ).run();

  // Gera planilha temporária de teste com exceljs
  await geraXlsxTeste(XLSX_TEMP, ExcelJS);
});

after(() => {
  try { getDb().close(); } catch { /* já fechado */ }
  for (const suf of ['', '-wal', '-shm']) {
    rmSync(`${DB}${suf}`, { force: true });
  }
  rmSync(XLSX_TEMP, { force: true });
});

/**
 * Gera uma planilha de teste com:
 *   - Ana Silva: jogo 1 (grupos, gols), jogo 65 (mata-mata com pênaltis)
 *   - Bruno Costa: jogo 2 (grupos, gols) + uma célula de gols em branco (→ null)
 *   - Uma linha completamente vazia (deve ser ignorada)
 */
async function geraXlsxTeste(caminho, ExcelJS) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Palpites');

  // Cabeçalho
  ws.addRow(['participante', 'jogo', 'gols_casa', 'gols_fora', 'time_casa', 'time_fora', 'pen_casa', 'pen_fora']);

  // Ana Silva — jogo 1 de grupos (só gols)
  ws.addRow(['Ana Silva', 1, 2, 1, '', '', '', '']);

  // Ana Silva — jogo 65 de mata-mata (gols + times + pênaltis)
  ws.addRow(['Ana Silva', 65, 1, 1, 'BRA', 'ARG', 4, 2]);

  // Bruno Costa — jogo 2 de grupos (gols_fora em branco → null)
  ws.addRow(['Bruno Costa', 2, 3, '', '', '', '', '']);

  // Linha completamente vazia — deve ser ignorada
  ws.addRow(['', '', '', '', '', '', '', '']);

  await wb.xlsx.writeFile(caminho);
}

// ---- Testes de leLinhasPlanilha ----

test('leLinhasPlanilha: lê 3 linhas válidas (a linha vazia é ignorada internamente)', async () => {
  const linhas = await leLinhasPlanilha(XLSX_TEMP);
  // A linha vazia tem participante=null e jogo=null → filtrada dentro da função
  assert.equal(linhas.length, 3, `Esperado 3 linhas, obtido ${linhas.length}`);
});

test('leLinhasPlanilha: colunas corretas na 1a linha (Ana Silva, jogo 1)', async () => {
  const linhas = await leLinhasPlanilha(XLSX_TEMP);
  const l = linhas[0];
  assert.equal(l.participante, 'Ana Silva');
  assert.equal(l.jogo, 1);
  assert.equal(l.gols_casa, 2);
  assert.equal(l.gols_fora, 1);
  // Grupos: time_casa e time_fora ficam null (strings vazias → null)
  assert.equal(l.time_casa, null);
  assert.equal(l.time_fora, null);
  assert.equal(l.pen_casa, null);
  assert.equal(l.pen_fora, null);
});

test('leLinhasPlanilha: mata-mata com pênaltis lido corretamente (Ana Silva, jogo 65)', async () => {
  const linhas = await leLinhasPlanilha(XLSX_TEMP);
  const l = linhas.find((r) => r.participante === 'Ana Silva' && r.jogo === 65);
  assert.ok(l, 'Linha de mata-mata não encontrada');
  assert.equal(l.time_casa, 'BRA');
  assert.equal(l.time_fora, 'ARG');
  assert.equal(l.pen_casa, 4);
  assert.equal(l.pen_fora, 2);
});

test('leLinhasPlanilha: gols_fora em branco vira null (Bruno Costa, jogo 2)', async () => {
  const linhas = await leLinhasPlanilha(XLSX_TEMP);
  const l = linhas.find((r) => r.participante === 'Bruno Costa');
  assert.ok(l, 'Linha de Bruno Costa não encontrada');
  assert.equal(l.gols_casa, 3);
  assert.equal(l.gols_fora, null, 'Célula em branco deve virar null, não 0');
});

// ---- Testes de importaLinhas ----

test('importaLinhas: cria participantes novos automaticamente', () => {
  const db = getDb();
  const linhas = [
    { participante: 'Carlos Novo', jogo: 1, gols_casa: 1, gols_fora: 0,
      time_casa: null, time_fora: null, pen_casa: null, pen_fora: null },
  ];
  const { importados, erros } = importaLinhas(db, linhas);
  assert.equal(erros.length, 0, `Erros inesperados: ${JSON.stringify(erros)}`);
  assert.equal(importados, 1);

  const jog = db.prepare("SELECT id FROM jogadores WHERE nome = 'Carlos Novo'").get();
  assert.ok(jog, 'Participante Carlos Novo deve ter sido criado');
});

test('importaLinhas: palpite de grupos grava só gols (times e pênaltis ficam null)', () => {
  const db = getDb();
  const linhas = [
    { participante: 'Daniela', jogo: 1, gols_casa: 2, gols_fora: 0,
      time_casa: 'NaoDeveGravar', time_fora: 'TambemNao', pen_casa: 99, pen_fora: 88 },
  ];
  importaLinhas(db, linhas);

  const jog = db.prepare("SELECT id FROM jogadores WHERE nome = 'Daniela'").get();
  assert.ok(jog);
  const p = db.prepare('SELECT * FROM palpites WHERE jogador_id=? AND jogo_numero=1').get(jog.id);
  assert.ok(p);
  assert.equal(p.gols_casa, 2);
  assert.equal(p.gols_fora, 0);
  // salvaPalpitesJogador ignora times e pênaltis em jogos de grupos
  assert.equal(p.time_casa, null, 'time_casa deve ser null em grupos');
  assert.equal(p.time_fora, null, 'time_fora deve ser null em grupos');
  assert.equal(p.penaltis_casa, null, 'penaltis_casa deve ser null em grupos');
  assert.equal(p.penaltis_fora, null, 'penaltis_fora deve ser null em grupos');
});

test('importaLinhas: palpite de mata-mata grava times e pênaltis', () => {
  const db = getDb();
  const linhas = [
    { participante: 'Eduardo', jogo: 65, gols_casa: 1, gols_fora: 1,
      time_casa: 'BRA', time_fora: 'ARG', pen_casa: 5, pen_fora: 4 },
  ];
  importaLinhas(db, linhas);

  const jog = db.prepare("SELECT id FROM jogadores WHERE nome = 'Eduardo'").get();
  assert.ok(jog);
  const p = db.prepare('SELECT * FROM palpites WHERE jogador_id=? AND jogo_numero=65').get(jog.id);
  assert.ok(p);
  assert.equal(p.time_casa, 'BRA');
  assert.equal(p.time_fora, 'ARG');
  assert.equal(p.penaltis_casa, 5);
  assert.equal(p.penaltis_fora, 4);
});

test('importaLinhas: campo em branco vira null (não 0) no banco', () => {
  const db = getDb();
  const linhas = [
    // gols_fora = null (em branco na planilha)
    { participante: 'Fernanda', jogo: 2, gols_casa: 1, gols_fora: null,
      time_casa: null, time_fora: null, pen_casa: null, pen_fora: null },
  ];
  importaLinhas(db, linhas);

  const jog = db.prepare("SELECT id FROM jogadores WHERE nome = 'Fernanda'").get();
  const p = db.prepare('SELECT * FROM palpites WHERE jogador_id=? AND jogo_numero=2').get(jog.id);
  assert.ok(p);
  assert.equal(p.gols_fora, null, 'gols_fora em branco deve ser null no banco');
});

test('importaLinhas: participante já existente é reutilizado (sem duplicata)', () => {
  const db = getDb();
  // Cria participante manualmente
  db.prepare("INSERT OR IGNORE INTO jogadores (nome) VALUES ('Gustavo Existente')").run();
  const antes = db.prepare("SELECT COUNT(*) c FROM jogadores WHERE nome='Gustavo Existente'").get().c;

  const linhas = [
    { participante: 'Gustavo Existente', jogo: 1, gols_casa: 0, gols_fora: 2,
      time_casa: null, time_fora: null, pen_casa: null, pen_fora: null },
  ];
  const { importados, erros } = importaLinhas(db, linhas);
  assert.equal(erros.length, 0);
  assert.equal(importados, 1);

  const depois = db.prepare("SELECT COUNT(*) c FROM jogadores WHERE nome='Gustavo Existente'").get().c;
  assert.equal(depois, antes, 'Não deve duplicar participante já existente');
});

test('importaLinhas: palpite existente é sobrescrito (upsert)', () => {
  const db = getDb();
  const nome = 'Helena Upsert';

  // Primeiro palpite
  importaLinhas(db, [
    { participante: nome, jogo: 1, gols_casa: 3, gols_fora: 0,
      time_casa: null, time_fora: null, pen_casa: null, pen_fora: null },
  ]);

  // Segundo palpite (sobrescreve)
  importaLinhas(db, [
    { participante: nome, jogo: 1, gols_casa: 0, gols_fora: 0,
      time_casa: null, time_fora: null, pen_casa: null, pen_fora: null },
  ]);

  const jog = db.prepare(`SELECT id FROM jogadores WHERE nome = ?`).get(nome);
  const count = db.prepare('SELECT COUNT(*) c FROM palpites WHERE jogador_id=? AND jogo_numero=1').get(jog.id).c;
  assert.equal(count, 1, 'Deve haver apenas 1 palpite (upsert, não duplicata)');

  const p = db.prepare('SELECT * FROM palpites WHERE jogador_id=? AND jogo_numero=1').get(jog.id);
  assert.equal(p.gols_casa, 0, 'Palpite deve ter sido sobrescrito');
});

test('importaLinhas: linha sem participante retorna erro sem abortar as demais', () => {
  const db = getDb();
  const linhas = [
    // Linha inválida (sem participante)
    { participante: null, jogo: 1, gols_casa: 1, gols_fora: 0,
      time_casa: null, time_fora: null, pen_casa: null, pen_fora: null },
    // Linha válida
    { participante: 'Igor Válido', jogo: 2, gols_casa: 2, gols_fora: 1,
      time_casa: null, time_fora: null, pen_casa: null, pen_fora: null },
  ];
  const { importados, erros } = importaLinhas(db, linhas);
  assert.equal(erros.length, 1, 'Deve ter 1 erro (linha sem participante)');
  assert.equal(importados, 1, 'Linha válida deve ter sido importada');
});

test('importaLinhas: linha sem jogo retorna erro', () => {
  const db = getDb();
  const linhas = [
    { participante: 'Jonas', jogo: null, gols_casa: 1, gols_fora: 0,
      time_casa: null, time_fora: null, pen_casa: null, pen_fora: null },
  ];
  const { importados, erros } = importaLinhas(db, linhas);
  assert.equal(erros.length, 1);
  assert.equal(importados, 0);
});

test('importaLinhas: dois participantes, múltiplos jogos — resultado correto', () => {
  const db = getDb();
  const linhas = [
    { participante: 'K-Ana', jogo: 1, gols_casa: 1, gols_fora: 0,
      time_casa: null, time_fora: null, pen_casa: null, pen_fora: null },
    { participante: 'K-Ana', jogo: 2, gols_casa: 2, gols_fora: 2,
      time_casa: null, time_fora: null, pen_casa: null, pen_fora: null },
    { participante: 'L-Bruno', jogo: 1, gols_casa: 0, gols_fora: 1,
      time_casa: null, time_fora: null, pen_casa: null, pen_fora: null },
  ];
  const { importados, erros } = importaLinhas(db, linhas);
  assert.equal(erros.length, 0, `Erros: ${JSON.stringify(erros)}`);
  assert.equal(importados, 3);

  const jAna   = db.prepare("SELECT id FROM jogadores WHERE nome = 'K-Ana'").get();
  const jBruno = db.prepare("SELECT id FROM jogadores WHERE nome = 'L-Bruno'").get();
  assert.ok(jAna);
  assert.ok(jBruno);

  const pAna1 = db.prepare('SELECT * FROM palpites WHERE jogador_id=? AND jogo_numero=1').get(jAna.id);
  const pAna2 = db.prepare('SELECT * FROM palpites WHERE jogador_id=? AND jogo_numero=2').get(jAna.id);
  assert.equal(pAna1.gols_casa, 1);
  assert.equal(pAna2.gols_casa, 2);

  const pBruno1 = db.prepare('SELECT * FROM palpites WHERE jogador_id=? AND jogo_numero=1').get(jBruno.id);
  assert.equal(pBruno1.gols_fora, 1);
});

// ---- Teste de integração: lê o xlsx gerado por gera-modelo.js ----

test('leLinhasPlanilha + importaLinhas: importa a planilha modelo (1 linha de exemplo)', async () => {
  const { fileURLToPath } = await import('node:url');
  const { dirname: dn } = await import('node:path');
  const modeloPath = join(dn(fileURLToPath(import.meta.url)), '..', 'exemplo', 'palpites-modelo.xlsx');

  const linhas = await leLinhasPlanilha(modeloPath);
  // O modelo tem 1 linha de exemplo (participante "Fulano de Tal", jogo 1)
  assert.equal(linhas.length, 1, `Esperado 1 linha no modelo, obtido ${linhas.length}`);
  assert.equal(linhas[0].participante, 'Fulano de Tal');
  assert.equal(linhas[0].jogo, 1);
});
