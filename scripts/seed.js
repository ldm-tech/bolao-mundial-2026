// Popula o SQLite a partir de data/seed-exemplo.json.
// Idempotente: pode rodar de novo sem duplicar. NAO apaga resultados ja lancados.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb, getConfig, setConfig } from '../src/db.js';
import { hashSenha } from '../src/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(
  readFileSync(join(__dirname, '..', 'data', 'seed-exemplo.json'), 'utf-8'),
);

export function runSeed(db = getDb()) {
  const upsertJogo = db.prepare(`
    INSERT INTO jogos (numero, fase, data, hora, cidade, pais, time_casa, time_fora)
    VALUES (@numero, @fase, @data, @hora, @cidade, @pais, @time_casa, @time_fora)
    ON CONFLICT(numero) DO UPDATE SET
      fase=excluded.fase, data=excluded.data, hora=excluded.hora,
      cidade=excluded.cidade, pais=excluded.pais,
      time_casa=excluded.time_casa, time_fora=excluded.time_fora`);

  const upsertJogador = db.prepare(`
    INSERT INTO jogadores (nome, chave, nome_exibicao, email, whatsapp, pago)
    VALUES (@nome, @chave, @nome_exibicao, @email, @whatsapp, @pago)
    ON CONFLICT(nome) DO UPDATE SET
      chave        = COALESCE(excluded.chave, jogadores.chave),
      nome_exibicao= COALESCE(excluded.nome_exibicao, jogadores.nome_exibicao),
      pago         = excluded.pago`);

  const idJogador = db.prepare('SELECT id FROM jogadores WHERE nome = ?');

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

  // Resultados de exemplo: apenas insere se ainda nao existir (preserva resultados reais)
  const upsertResultado = db.prepare(`
    INSERT INTO resultados
      (jogo_numero, gols_casa, gols_fora, time_casa, time_fora, penaltis_casa, penaltis_fora, atualizado_em)
    VALUES
      (@jogo_numero, @gols_casa, @gols_fora, @time_casa, @time_fora, @penaltis_casa, @penaltis_fora, @atualizado_em)
    ON CONFLICT(jogo_numero) DO NOTHING`);

  db.transaction(() => {
    // 1. Jogos (104 do fixture-base)
    for (const jogo of seed.fixture) upsertJogo.run(jogo);

    // 2. Participantes ficticios
    for (const p of seed.participantes) {
      upsertJogador.run({
        nome:          p.nome,
        chave:         p.chave,
        nome_exibicao: p.nome,
        email:         null,
        whatsapp:      null,
        pago:          p.pago,
      });
      const { id } = idJogador.get(p.nome);

      // 3. Palpites de grupos
      const palps = seed.palpites[p.nome] || {};
      for (const [numStr, pal] of Object.entries(palps)) {
        upsertPalpite.run({
          jogador_id:    id,
          jogo_numero:   Number(numStr),
          gols_casa:     pal.gols_casa,
          gols_fora:     pal.gols_fora,
          time_casa:     pal.time_casa     ?? null,
          time_fora:     pal.time_fora     ?? null,
          penaltis_casa: pal.penaltis_casa ?? null,
          penaltis_fora: pal.penaltis_fora ?? null,
        });
      }

      // 4. Especiais
      const esp = seed.especiais[p.nome] || {};
      upsertEspecial.run({
        jogador_id:  id,
        artilheiro:  esp.artilheiro  ?? null,
        campeao:     esp.campeao     ?? null,
        finalista_1: esp.finalista_1 ?? null,
        finalista_2: esp.finalista_2 ?? null,
      });
    }

    // 5. Resultados de exemplo (primeiras rodadas) — nao sobrepoe resultados reais
    const TS = '2026-06-11T00:00:00Z';
    for (const r of seed.resultados) {
      upsertResultado.run({
        jogo_numero:   r.jogo_numero,
        gols_casa:     r.gols_casa,
        gols_fora:     r.gols_fora,
        time_casa:     r.time_casa     ?? null,
        time_fora:     r.time_fora     ?? null,
        penaltis_casa: r.penaltis_casa ?? null,
        penaltis_fora: r.penaltis_fora ?? null,
        atualizado_em: TS,
      });
    }

    // 6. Auto-cura: remove participantes orfaos (chave nao esta mais no seed)
    const chaves = seed.participantes.map((p) => p.chave);
    if (chaves.length > 0) {
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
  })();
}

// Quando executado diretamente (nao importado como modulo)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = getDb();
  runSeed(db);

  // Senha admin: usa BOLAO_ADMIN_SENHA na 1a vez; senao gera uma e mostra no console.
  if (!getConfig('senha_admin_hash')) {
    const gerada = !process.env.BOLAO_ADMIN_SENHA;
    const senha = process.env.BOLAO_ADMIN_SENHA || Math.random().toString(36).slice(2, 10);
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
  const r = db.prepare('SELECT COUNT(*) c FROM resultados').get().c;
  console.log(`Seed concluido: ${n} jogadores, ${j} jogos, ${p} palpites, ${r} resultados.`);
}
