/**
 * Funções puras de CRUD de participantes (jogadores).
 * Todas recebem `db` como primeiro argumento — fácil de testar com :memory:.
 */

/**
 * Cria um novo participante.
 * @param {import('better-sqlite3').Database} db
 * @param {{ nome: string, nome_exibicao?: string, email?: string, whatsapp?: string }} dados
 * @returns {{ ok: true, id: number } | { ok: false, erro: string }}
 */
export function criaParticipante(db, dados) {
  const nome = (dados.nome ?? '').toString().trim();
  if (!nome) return { ok: false, erro: 'Nome é obrigatório.' };

  const nome_exibicao = txtOuNull(dados.nome_exibicao);
  const email        = txtOuNull(dados.email);
  const whatsapp     = txtOuNull(dados.whatsapp);

  try {
    const info = db.prepare(
      'INSERT INTO jogadores (nome, nome_exibicao, email, whatsapp) VALUES (?, ?, ?, ?)',
    ).run(nome, nome_exibicao, email, whatsapp);
    return { ok: true, id: info.lastInsertRowid };
  } catch (err) {
    if (err.message.includes('UNIQUE')) return { ok: false, erro: 'Já existe um participante com este nome.' };
    throw err;
  }
}

/**
 * Edita um participante existente.
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {{ nome: string, nome_exibicao?: string, email?: string, whatsapp?: string, pago?: any }} dados
 * @returns {{ ok: true } | { ok: false, erro: string }}
 */
export function editaParticipante(db, id, dados) {
  const nome = (dados.nome ?? '').toString().trim();
  if (!nome) return { ok: false, erro: 'Nome é obrigatório.' };

  const nome_exibicao = txtOuNull(dados.nome_exibicao);
  const email        = txtOuNull(dados.email);
  const whatsapp     = txtOuNull(dados.whatsapp);
  const pago         = dados.pago ? 1 : 0;

  try {
    const info = db.prepare(
      'UPDATE jogadores SET nome=?, nome_exibicao=?, email=?, whatsapp=?, pago=? WHERE id=?',
    ).run(nome, nome_exibicao, email, whatsapp, pago, id);
    if (info.changes === 0) return { ok: false, erro: 'Participante não encontrado.' };
    return { ok: true };
  } catch (err) {
    if (err.message.includes('UNIQUE')) return { ok: false, erro: 'Já existe um participante com este nome.' };
    throw err;
  }
}

/**
 * Remove um participante e todos os seus palpites (transação).
 * Necessário porque foreign_keys = ON impede DELETE sem antes remover filhos.
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @returns {{ ok: true } | { ok: false, erro: string }}
 */
export function removeParticipante(db, id) {
  const jogador = db.prepare('SELECT id FROM jogadores WHERE id = ?').get(id);
  if (!jogador) return { ok: false, erro: 'Participante não encontrado.' };

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM palpites_especiais WHERE jogador_id = ?').run(id);
    db.prepare('DELETE FROM classificacao_grupos WHERE jogador_id = ?').run(id);
    db.prepare('DELETE FROM palpites WHERE jogador_id = ?').run(id);
    db.prepare('DELETE FROM jogadores WHERE id = ?').run(id);
  });
  tx();
  return { ok: true };
}

/**
 * Lista todos os participantes ordenados por nome.
 * Retorna nome_exibicao se preenchido, caso contrário nome.
 */
export function listaParticipantes(db) {
  return db.prepare(
    "SELECT id, nome, COALESCE(NULLIF(nome_exibicao, ''), nome) AS nome_exib, " +
    'email, whatsapp, pago FROM jogadores ORDER BY nome COLLATE NOCASE',
  ).all();
}

// ---- helpers internos ----
function txtOuNull(v) {
  const s = (v ?? '').toString().trim();
  return s === '' ? null : s;
}
