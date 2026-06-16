// Popula o SQLite a partir de data/seed.json (gerado por scripts/extract.py).
// Idempotente: pode rodar de novo sem duplicar. NAO apaga resultados ja lancados.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb, getConfig, setConfig } from '../src/db.js';
import { hashSenha } from '../src/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'seed.json'), 'utf-8'));
const contatosPath = join(__dirname, '..', 'data', 'contatos.json');
const contatos = existsSync(contatosPath)
  ? JSON.parse(readFileSync(contatosPath, 'utf-8'))
  : [];
const contatoPorNome = new Map(contatos.map((c) => [c.nome, c]));
const db = getDb();

const upsertJogador = db.prepare(`
  INSERT INTO jogadores (nome, chave, nome_exibicao, email, whatsapp)
  VALUES (@nome, @chave, @nome_exibicao, @email, @whatsapp)
  ON CONFLICT(nome) DO UPDATE SET
    chave = COALESCE(excluded.chave, jogadores.chave),
    email = COALESCE(excluded.email, jogadores.email),
    whatsapp = COALESCE(excluded.whatsapp, jogadores.whatsapp)`);
const idJogador = db.prepare('SELECT id FROM jogadores WHERE nome = ?');
const upsertJogo = db.prepare(`
  INSERT INTO jogos (numero, fase, data, hora, cidade, pais, time_casa, time_fora)
  VALUES (@numero, @fase, @data, @hora, @cidade, @pais, @time_casa, @time_fora)
  ON CONFLICT(numero) DO UPDATE SET
    fase=excluded.fase, data=excluded.data, hora=excluded.hora,
    cidade=excluded.cidade, pais=excluded.pais,
    time_casa=excluded.time_casa, time_fora=excluded.time_fora`);
const upsertPalpite = db.prepare(`
  INSERT INTO palpites
    (jogador_id, jogo_numero, gols_casa, gols_fora, time_casa, time_fora, penaltis_casa, penaltis_fora)
  VALUES
    (@jogador_id, @jogo_numero, @gols_casa, @gols_fora, @time_casa, @time_fora, @penaltis_casa, @penaltis_fora)
  ON CONFLICT(jogador_id, jogo_numero) DO UPDATE SET
    gols_casa=excluded.gols_casa, gols_fora=excluded.gols_fora,
    time_casa=excluded.time_casa, time_fora=excluded.time_fora,
    penaltis_casa=excluded.penaltis_casa, penaltis_fora=excluded.penaltis_fora`);
const upsertEspecial = db.prepare(`
  INSERT INTO palpites_especiais (jogador_id, artilheiro, campeao, finalista_1, finalista_2)
  VALUES (@jogador_id, @artilheiro, @campeao, @finalista_1, @finalista_2)
  ON CONFLICT(jogador_id) DO UPDATE SET
    artilheiro=excluded.artilheiro, campeao=excluded.campeao,
    finalista_1=excluded.finalista_1, finalista_2=excluded.finalista_2`);
const upsertGrupo = db.prepare(`
  INSERT INTO classificacao_grupos (jogador_id, grupo, posicao, time)
  VALUES (@jogador_id, @grupo, @posicao, @time)
  ON CONFLICT(jogador_id, grupo, posicao) DO UPDATE SET time=excluded.time`);

const run = db.transaction(() => {
  for (const jogo of seed.fixture) upsertJogo.run(jogo);

  for (const nome of seed.jogadores) {
    const c = contatoPorNome.get(nome) || {};
    upsertJogador.run({
      nome,
      chave: c.chave ?? nome,
      nome_exibicao: nome,
      email: c.email ?? null,
      whatsapp: c.whatsapp ?? null,
    });
    const { id } = idJogador.get(nome);
    const palpites = seed.palpites[nome];
    for (const [numero, p] of Object.entries(palpites)) {
      upsertPalpite.run({
        jogador_id: id,
        jogo_numero: Number(numero),
        gols_casa: p.gols_casa,
        gols_fora: p.gols_fora,
        time_casa: p.time_casa,
        time_fora: p.time_fora,
        penaltis_casa: p.pen_casa ?? null,
        penaltis_fora: p.pen_fora ?? null,
      });
    }
    const esp = seed.especiais[nome] || {};
    upsertEspecial.run({
      jogador_id: id,
      artilheiro: esp.artilheiro ?? null,
      campeao: esp.campeao ?? null,
      finalista_1: esp.finalista_1 ?? null,
      finalista_2: esp.finalista_2 ?? null,
    });
    const grupos = (seed.grupos && seed.grupos[nome]) || {};
    for (const [grupo, times] of Object.entries(grupos)) {
      times.forEach((time, i) => {
        upsertGrupo.run({ jogador_id: id, grupo, posicao: i + 1, time: time ?? null });
      });
    }
  }

  // Auto-cura: remove jogadores que nao estao mais na lista canonica do seed
  // (ex.: renomeados), junto com os dados dependentes. Evita duplicatas quando
  // o banco persiste entre deploys (volume Docker).
  if (seed.jogadores.length > 0) {
    const chaves = seed.jogadores.map((nome) => (contatoPorNome.get(nome)?.chave ?? nome));
    const ph = chaves.map(() => '?').join(',');
    const orfaos = db
      .prepare(`SELECT id, nome FROM jogadores WHERE chave NOT IN (${ph})`)
      .all(...chaves);
    for (const o of orfaos) {
      db.prepare('DELETE FROM palpites WHERE jogador_id = ?').run(o.id);
      db.prepare('DELETE FROM palpites_especiais WHERE jogador_id = ?').run(o.id);
      db.prepare('DELETE FROM classificacao_grupos WHERE jogador_id = ?').run(o.id);
      db.prepare('DELETE FROM jogadores WHERE id = ?').run(o.id);
      console.log(`Jogador orfao removido: ${o.nome}`);
    }
  }
});

run();

// Senha admin: usa BOLAO_ADMIN_SENHA na 1a vez; senao gera uma e mostra no console.
if (!getConfig('senha_admin_hash')) {
  let senha = process.env.BOLAO_ADMIN_SENHA;
  let gerada = false;
  if (!senha) {
    senha = Math.random().toString(36).slice(2, 10);
    gerada = true;
  }
  setConfig('senha_admin_hash', hashSenha(senha));
  if (gerada) {
    console.log('\n*** SENHA ADMIN GERADA (guarde!): ' + senha + ' ***\n');
  } else {
    console.log('Senha admin definida a partir de BOLAO_ADMIN_SENHA.');
  }
}

const n = db.prepare('SELECT COUNT(*) c FROM jogadores').get().c;
const j = db.prepare('SELECT COUNT(*) c FROM jogos').get().c;
const p = db.prepare('SELECT COUNT(*) c FROM palpites').get().c;
console.log(`Seed concluido: ${n} jogadores, ${j} jogos, ${p} palpites.`);
