/**
 * Funções puras de leitura/gravação de palpites por participante.
 * Usadas pelo admin (/admin/palpites) para lançar ou editar palpites
 * de um jogador sem depender de planilha.
 *
 * Todas recebem `db` como primeiro argumento — fácil testar com :memory:.
 */

// ---- helpers internos ----
function numOuNull(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
function txtOuNull(v) {
  const s = (v ?? '').toString().trim();
  return s === '' ? null : s;
}

/**
 * Grava (upsert) os palpites de um jogador para uma lista de jogos e
 * os especiais (artilheiro/campeão), tudo numa transação.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} jogadorId
 * @param {{ porJogo: Array<{ jogo_numero, fase, gols_casa?, gols_fora?,
 *            time_casa?, time_fora?, penaltis_casa?, penaltis_fora? }>,
 *           especiais?: { artilheiro?, campeao?, finalista_1?, finalista_2? } }} payload
 * @returns {{ ok: true } | { ok: false, erro: string }}
 */
export function salvaPalpitesJogador(db, jogadorId, { porJogo = [], especiais = null } = {}) {
  const jogador = db.prepare('SELECT id FROM jogadores WHERE id = ?').get(jogadorId);
  if (!jogador) return { ok: false, erro: 'Participante não encontrado.' };

  const upsertPalpite = db.prepare(`
    INSERT INTO palpites
      (jogador_id, jogo_numero, gols_casa, gols_fora, time_casa, time_fora, penaltis_casa, penaltis_fora)
    VALUES
      (@jogador_id, @jogo_numero, @gols_casa, @gols_fora, @time_casa, @time_fora, @penaltis_casa, @penaltis_fora)
    ON CONFLICT(jogador_id, jogo_numero) DO UPDATE SET
      gols_casa      = excluded.gols_casa,
      gols_fora      = excluded.gols_fora,
      time_casa      = excluded.time_casa,
      time_fora      = excluded.time_fora,
      penaltis_casa  = excluded.penaltis_casa,
      penaltis_fora  = excluded.penaltis_fora
  `);

  const upsertEspeciais = db.prepare(`
    INSERT INTO palpites_especiais (jogador_id, artilheiro, campeao, finalista_1, finalista_2)
    VALUES (@jogador_id, @artilheiro, @campeao, @finalista_1, @finalista_2)
    ON CONFLICT(jogador_id) DO UPDATE SET
      artilheiro  = excluded.artilheiro,
      campeao     = excluded.campeao,
      finalista_1 = excluded.finalista_1,
      finalista_2 = excluded.finalista_2
  `);

  try {
    const tx = db.transaction(() => {
      for (const j of porJogo) {
        const ehGrupos = j.fase === 'grupos';
        upsertPalpite.run({
          jogador_id:    jogadorId,
          jogo_numero:   j.jogo_numero,
          gols_casa:     numOuNull(j.gols_casa),
          gols_fora:     numOuNull(j.gols_fora),
          // Grupos: times vêm do fixture, não do palpite — nunca grava aqui
          time_casa:     ehGrupos ? null : txtOuNull(j.time_casa),
          time_fora:     ehGrupos ? null : txtOuNull(j.time_fora),
          // Pênaltis só existem do mata-mata em diante
          penaltis_casa: ehGrupos ? null : numOuNull(j.penaltis_casa),
          penaltis_fora: ehGrupos ? null : numOuNull(j.penaltis_fora),
        });
      }

      if (especiais) {
        upsertEspeciais.run({
          jogador_id:  jogadorId,
          artilheiro:  txtOuNull(especiais.artilheiro),
          campeao:     txtOuNull(especiais.campeao),
          finalista_1: txtOuNull(especiais.finalista_1),
          finalista_2: txtOuNull(especiais.finalista_2),
        });
      }
    });
    tx();
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

/**
 * Lê os palpites atuais de um jogador, retornando um mapa jogo_numero → palpite
 * e os especiais.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} jogadorId
 * @returns {{ porJogo: Map<number, object>, especiais: object }}
 */
export function lePalpitesJogador(db, jogadorId) {
  const linhas = db
    .prepare('SELECT * FROM palpites WHERE jogador_id = ?')
    .all(jogadorId);
  const porJogo = new Map(linhas.map((p) => [p.jogo_numero, p]));

  const especiais =
    db
      .prepare('SELECT * FROM palpites_especiais WHERE jogador_id = ?')
      .get(jogadorId) || {};

  return { porJogo, especiais };
}
