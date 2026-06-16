import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canoniza, normalizaNome } from '../src/jogadores-fut.js';
import { montaArtilheiros } from '../src/artilheiros.js';

test('canoniza funde grafias do mesmo jogador', () => {
  assert.equal(canoniza('Mbappe').nome, 'Kylian Mbappé');
  assert.equal(canoniza('Kylian Mbappé').nome, 'Kylian Mbappé');
  assert.equal(canoniza('MBAPÉ').nome, 'Kylian Mbappé');
  assert.equal(canoniza('Mbappé (tartaruga)').nome, 'Kylian Mbappé');
  assert.equal(canoniza('Yamal').nome, 'Lamine Yamal');
  assert.equal(canoniza('Lamine').nome, 'Lamine Yamal');
  assert.equal(canoniza('Vini Jr').nome, 'Vinícius Júnior');
  assert.equal(canoniza('Igor Thiago - Brasil').nome, 'Igor Thiago');
});

test('canoniza: grafia desconhecida cai no fallback (canonico=false)', () => {
  const c = canoniza('Fulano da Silva');
  assert.equal(c.canonico, false);
  assert.equal(c.nome, 'Fulano Da Silva');
});

test('canoniza vazio -> null', () => {
  assert.equal(canoniza(''), null);
  assert.equal(canoniza(null), null);
});

test('normalizaNome remove anotacao entre parenteses e apos hifen', () => {
  assert.equal(normalizaNome('Kylian Mbappé (França)'), 'kylian mbappe');
  assert.equal(normalizaNome('Igor Thiago - Brasil'), 'igor thiago');
});

test('montaArtilheiros agrega os gols da ESPN (aovivo_detalhe) e cruza com palpites', async () => {
  process.env.BOLAO_DB = ':memory:';
  const { getDb, setConfig } = await import('../src/db.js');
  const db = getDb();
  db.prepare("INSERT INTO jogos (numero, fase, time_casa, time_fora) VALUES (1,'grupos','França','Inglaterra')").run();
  db.prepare("INSERT INTO jogadores (id, nome) VALUES (1,'Ana'),(2,'Bruno'),(3,'Carla')").run();
  // Ana apostou no Mbappe (grafia curta), Bruno no Kane, Carla num ze-ninguem
  db.prepare(
    "INSERT INTO palpites_especiais (jogador_id, artilheiro) VALUES (1,'Mbappe'),(2,'Kane'),(3,'Fulano')",
  ).run();
  // gols da ESPN: Mbappe x2 (grafias diferentes) na França, Kane x1 na Inglaterra, 1 gol-contra (ignora)
  setConfig(
    'aovivo_detalhe',
    JSON.stringify({
      1: {
        numero: 1,
        golsCasa: [
          { min: 10, nome: 'Kylian Mbappé', tipo: 'REGULAR' },
          { min: 30, nome: 'Mbappe', tipo: 'REGULAR' },
          { min: 70, nome: 'Zagueiro Azarado', tipo: 'OWN' },
        ],
        golsFora: [{ min: 50, nome: 'Harry Kane', tipo: 'REGULAR' }],
      },
    }),
  );

  const r = montaArtilheiros(db);
  assert.equal(r.maxGols, 2); // Mbappe lidera com 2
  assert.equal(r.ranking[0].nome, 'Kylian Mbappé');
  assert.equal(r.ranking[0].gols, 2);
  assert.equal(r.ranking[0].nApostas, 1); // a Ana apostou nele
  // gol-contra nao entrou no ranking
  assert.ok(!r.ranking.some((s) => s.nome.includes('Azarado')));
  // quem ta levando = quem apostou no lider (Mbappe) = Ana
  assert.deepEqual(r.acertando, ['Ana']);
  // a Carla apostou num jogador que nao fez gol -> aparece com 0
  const fulano = r.linhasBolao.find((p) => p.nome === 'Fulano');
  assert.ok(fulano && fulano.gols === 0);
});
