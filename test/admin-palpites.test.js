import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Banco isolado em arquivo temporário (não :memory: para evitar colisão com outros módulos)
const DB = join(tmpdir(), `bolao_palpites_test_${process.pid}.db`);
process.env.BOLAO_DB = DB;

let getDb, salvaPalpitesJogador, lePalpitesJogador;

before(async () => {
  ({ getDb } = await import('../src/db.js'));
  ({ salvaPalpitesJogador, lePalpitesJogador } = await import('../src/palpites-admin.js'));

  const db = getDb();
  // fixtures mínimos: 3 jogos (grupos) + 1 (mata-mata) + 1 jogador
  db.prepare("INSERT OR IGNORE INTO jogos (numero, fase, time_casa, time_fora) VALUES (1,'grupos','Brasil','Alemanha')").run();
  db.prepare("INSERT OR IGNORE INTO jogos (numero, fase, time_casa, time_fora) VALUES (2,'grupos','Argentina','França')").run();
  db.prepare("INSERT OR IGNORE INTO jogos (numero, fase, time_casa, time_fora) VALUES (3,'grupos','Espanha','Portugal')").run();
  db.prepare("INSERT OR IGNORE INTO jogos (numero, fase) VALUES (65,'oitavas')").run();
  db.prepare("INSERT OR IGNORE INTO jogadores (id, nome) VALUES (1,'João')").run();
  db.prepare("INSERT OR IGNORE INTO jogadores (id, nome) VALUES (2,'Maria')").run();
});

after(() => {
  try { getDb().close(); } catch { /* já fechado */ }
  for (const suf of ['', '-wal', '-shm']) {
    rmSync(`${DB}${suf}`, { force: true });
  }
});

// ---- salvaPalpitesJogador ----

test('lança palpite de grupos (só gols, sem times)', () => {
  const db = getDb();
  const r = salvaPalpitesJogador(db, 1, {
    porJogo: [
      { jogo_numero: 1, fase: 'grupos', gols_casa: 2, gols_fora: 1 },
    ],
  });
  assert.ok(r.ok, JSON.stringify(r));

  const row = db.prepare('SELECT * FROM palpites WHERE jogador_id=1 AND jogo_numero=1').get();
  assert.equal(row.gols_casa, 2);
  assert.equal(row.gols_fora, 1);
  // times devem ficar null nos grupos
  assert.equal(row.time_casa, null);
  assert.equal(row.time_fora, null);
  assert.equal(row.penaltis_casa, null);
  assert.equal(row.penaltis_fora, null);
});

test('lança palpite de mata-mata (times + gols + pênaltis)', () => {
  const db = getDb();
  const r = salvaPalpitesJogador(db, 1, {
    porJogo: [
      {
        jogo_numero: 65,
        fase: 'oitavas',
        time_casa: 'Brasil',
        time_fora: 'Argentina',
        gols_casa: 1,
        gols_fora: 1,
        penaltis_casa: 4,
        penaltis_fora: 3,
      },
    ],
  });
  assert.ok(r.ok, JSON.stringify(r));

  const row = db.prepare('SELECT * FROM palpites WHERE jogador_id=1 AND jogo_numero=65').get();
  assert.equal(row.time_casa, 'Brasil');
  assert.equal(row.time_fora, 'Argentina');
  assert.equal(row.gols_casa, 1);
  assert.equal(row.gols_fora, 1);
  assert.equal(row.penaltis_casa, 4);
  assert.equal(row.penaltis_fora, 3);
});

test('lança especiais (artilheiro texto livre e campeão)', () => {
  const db = getDb();
  const r = salvaPalpitesJogador(db, 1, {
    porJogo: [],
    especiais: { artilheiro: 'Vini Jr.', campeao: 'Brasil' },
  });
  assert.ok(r.ok, JSON.stringify(r));

  const esp = db.prepare('SELECT * FROM palpites_especiais WHERE jogador_id=1').get();
  assert.equal(esp.artilheiro, 'Vini Jr.');
  assert.equal(esp.campeao, 'Brasil');
});

test('editar palpite existente faz upsert (sobrescreve)', () => {
  const db = getDb();
  // primeiro lança 2x1
  salvaPalpitesJogador(db, 2, {
    porJogo: [{ jogo_numero: 2, fase: 'grupos', gols_casa: 2, gols_fora: 1 }],
  });
  // depois atualiza para 0x0
  const r = salvaPalpitesJogador(db, 2, {
    porJogo: [{ jogo_numero: 2, fase: 'grupos', gols_casa: 0, gols_fora: 0 }],
  });
  assert.ok(r.ok, JSON.stringify(r));

  const row = db.prepare('SELECT * FROM palpites WHERE jogador_id=2 AND jogo_numero=2').get();
  assert.equal(row.gols_casa, 0);
  assert.equal(row.gols_fora, 0);
  // deve haver apenas UMA linha (upsert, não duplicata)
  const count = db.prepare('SELECT COUNT(*) c FROM palpites WHERE jogador_id=2 AND jogo_numero=2').get().c;
  assert.equal(count, 1);
});

test('campos vazios viram null (não 0)', () => {
  const db = getDb();
  const r = salvaPalpitesJogador(db, 2, {
    porJogo: [
      { jogo_numero: 3, fase: 'grupos', gols_casa: '', gols_fora: null },
    ],
  });
  assert.ok(r.ok, JSON.stringify(r));

  const row = db.prepare('SELECT * FROM palpites WHERE jogador_id=2 AND jogo_numero=3').get();
  assert.equal(row.gols_casa, null);
  assert.equal(row.gols_fora, null);
});

test('jogador_id inexistente retorna erro sem gravar', () => {
  const db = getDb();
  const r = salvaPalpitesJogador(db, 99999, {
    porJogo: [{ jogo_numero: 1, fase: 'grupos', gols_casa: 1, gols_fora: 0 }],
  });
  assert.ok(!r.ok);
  assert.ok(r.erro && r.erro.length > 0);
});

test('campos de time no grupo ficam null mesmo se enviados', () => {
  const db = getDb();
  salvaPalpitesJogador(db, 1, {
    porJogo: [
      // Mesmo com time_casa/fora preenchidos num jogo de grupos,
      // o módulo deve ignorá-los (times vêm do fixture)
      {
        jogo_numero: 1,
        fase: 'grupos',
        gols_casa: 3,
        gols_fora: 2,
        time_casa: 'NaoDeveGravar',
        time_fora: 'TambemNao',
      },
    ],
  });
  const row = db.prepare('SELECT * FROM palpites WHERE jogador_id=1 AND jogo_numero=1').get();
  assert.equal(row.time_casa, null);
  assert.equal(row.time_fora, null);
});

test('upsert de especiais sobrescreve registro anterior', () => {
  const db = getDb();
  salvaPalpitesJogador(db, 2, {
    porJogo: [],
    especiais: { artilheiro: 'Mbappé', campeao: 'França' },
  });
  const r = salvaPalpitesJogador(db, 2, {
    porJogo: [],
    especiais: { artilheiro: 'Haaland', campeao: 'Noruega' },
  });
  assert.ok(r.ok);

  const esp = db.prepare('SELECT * FROM palpites_especiais WHERE jogador_id=2').get();
  assert.equal(esp.artilheiro, 'Haaland');
  assert.equal(esp.campeao, 'Noruega');
  const count = db.prepare('SELECT COUNT(*) c FROM palpites_especiais WHERE jogador_id=2').get().c;
  assert.equal(count, 1);
});

// ---- lePalpitesJogador ----

test('lePalpitesJogador retorna mapa de palpites e especiais', () => {
  const db = getDb();
  // garante palpite do jogo 1 para jogador 1
  salvaPalpitesJogador(db, 1, {
    porJogo: [{ jogo_numero: 1, fase: 'grupos', gols_casa: 1, gols_fora: 1 }],
    especiais: { artilheiro: 'Neymar', campeao: 'Brasil' },
  });

  const { porJogo, especiais } = lePalpitesJogador(db, 1);
  assert.ok(porJogo instanceof Map);
  const p = porJogo.get(1);
  assert.ok(p, 'palpite do jogo 1 deve existir');
  assert.equal(p.gols_casa, 1);
  assert.equal(especiais.artilheiro, 'Neymar');
  assert.equal(especiais.campeao, 'Brasil');
});

test('lePalpitesJogador para jogador sem palpites retorna mapa vazio e especiais {}', () => {
  const db = getDb();
  // cria um terceiro jogador sem palpites
  db.prepare("INSERT OR IGNORE INTO jogadores (id, nome) VALUES (3,'Zé Sem Palpite')").run();

  const { porJogo, especiais } = lePalpitesJogador(db, 3);
  assert.ok(porJogo instanceof Map);
  assert.equal(porJogo.size, 0);
  // especiais deve ser objeto vazio (sem erro)
  assert.equal(typeof especiais, 'object');
});
