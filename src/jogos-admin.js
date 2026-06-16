/**
 * Funções puras de CRUD de jogos (fixtures).
 * Usadas pelo admin (/admin/jogos) para criar, editar e remover jogos
 * sem depender de planilha ou API externa.
 *
 * Todas recebem `db` como primeiro argumento — fácil de testar com :memory:.
 *
 * Decisão sobre remoção: CASCADE MANUAL em transação.
 * Ao remover um jogo, a função apaga em ordem:
 *   1. resultados_ao_vivo  (referencia jogo_numero)
 *   2. odds_mercado        (referencia jogo_numero)
 *   3. resultados          (referencia jogo_numero)
 *   4. palpites            (referencia jogo_numero)
 *   5. jogos               (linha principal)
 * Isso é consistente com a estratégia de cascade manual usada em
 * removeParticipante (src/participantes.js) e evita perda silenciosa de
 * dados — o admin que remove um jogo está ciente de que palpites somem.
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
 * Upsert de um jogo na tabela `jogos`.
 * Identifica o registro pelo campo `numero` (PK).
 * Se o jogo não existir, cria; se existir, atualiza os campos informados.
 *
 * Colunas aceitas: numero, fase, grupo, data, hora, cidade, pais, time_casa, time_fora.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ numero: number|string, fase: string, grupo?: string,
 *            data?: string, hora?: string, cidade?: string, pais?: string,
 *            time_casa?: string, time_fora?: string }} dados
 * @returns {{ ok: true } | { ok: false, erro: string }}
 */
export function salvaJogo(db, dados) {
  const numero = numOuNull(dados.numero);
  if (!numero) return { ok: false, erro: 'Número do jogo é obrigatório e deve ser inteiro positivo.' };

  const fase = txtOuNull(dados.fase);
  if (!fase) return { ok: false, erro: 'Fase é obrigatória.' };

  const grupo     = txtOuNull(dados.grupo);
  const data      = txtOuNull(dados.data);
  const hora      = txtOuNull(dados.hora);
  const cidade    = txtOuNull(dados.cidade);
  const pais      = txtOuNull(dados.pais);
  const time_casa = txtOuNull(dados.time_casa);
  const time_fora = txtOuNull(dados.time_fora);

  try {
    db.prepare(`
      INSERT INTO jogos (numero, fase, grupo, data, hora, cidade, pais, time_casa, time_fora)
      VALUES (@numero, @fase, @grupo, @data, @hora, @cidade, @pais, @time_casa, @time_fora)
      ON CONFLICT(numero) DO UPDATE SET
        fase      = excluded.fase,
        grupo     = excluded.grupo,
        data      = excluded.data,
        hora      = excluded.hora,
        cidade    = excluded.cidade,
        pais      = excluded.pais,
        time_casa = excluded.time_casa,
        time_fora = excluded.time_fora
    `).run({ numero, fase, grupo, data, hora, cidade, pais, time_casa, time_fora });
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

/**
 * Remove um jogo e todas as suas dependências (cascade manual em transação).
 * Dependências removidas: palpites, resultados, odds_mercado, resultados_ao_vivo.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number|string} numero
 * @returns {{ ok: true } | { ok: false, erro: string }}
 */
export function removeJogo(db, numero) {
  const num = numOuNull(numero);
  if (!num) return { ok: false, erro: 'Número do jogo inválido.' };

  const jogo = db.prepare('SELECT numero FROM jogos WHERE numero = ?').get(num);
  if (!jogo) return { ok: false, erro: 'Jogo não encontrado.' };

  const tx = db.transaction(() => {
    // dependências em ordem de FK (filhos antes do pai)
    db.prepare('DELETE FROM resultados_ao_vivo WHERE jogo_numero = ?').run(num);
    db.prepare('DELETE FROM odds_mercado WHERE jogo_numero = ?').run(num);
    db.prepare('DELETE FROM resultados WHERE jogo_numero = ?').run(num);
    db.prepare('DELETE FROM palpites WHERE jogo_numero = ?').run(num);
    db.prepare('DELETE FROM jogos WHERE numero = ?').run(num);
  });
  tx();
  return { ok: true };
}

/**
 * Lista todos os jogos ordenados por número.
 * Retorna array plano — o chamador pode agrupar por fase conforme necessário.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<object>}
 */
export function listaJogos(db) {
  return db.prepare('SELECT * FROM jogos ORDER BY numero').all();
}
