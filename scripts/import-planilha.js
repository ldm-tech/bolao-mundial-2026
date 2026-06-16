/**
 * scripts/import-planilha.js
 *
 * Importador OPCIONAL de palpites a partir de planilha .xlsx.
 * Usa a aba "Palpites" com o formato gerado por scripts/gera-modelo.js.
 *
 * Uso (linha de comando):
 *   node scripts/import-planilha.js [caminho/da/planilha.xlsx]
 *
 * Se o caminho for omitido, usa exemplo/palpites-modelo.xlsx.
 *
 * Comportamento:
 *  - Participante ausente no banco → criado automaticamente (upsert por nome).
 *  - Participante já existente → reutilizado (lookup por nome).
 *  - Palpite existente → sobrescrito (upsert).
 *  - Células em branco → null (nunca 0).
 *  - Jogo de grupos (fase="grupos"): time_casa/time_fora/pen_casa/pen_fora ignorados.
 *  - Jogo de mata-mata: time_casa/time_fora e (se houver) pen_casa/pen_fora gravados.
 *  - Linhas completamente vazias são ignoradas.
 *  - Erros por linha são registrados sem abortar as demais.
 */

import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { criaParticipante }    from '../src/participantes.js';
import { salvaPalpitesJogador } from '../src/palpites-admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Helpers ----

/** Converte qualquer valor de célula para inteiro ≥ 0, ou null se vazio/inválido. */
function numOuNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Converte qualquer valor de célula para string não-vazia, ou null. */
function txtOuNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * Lê uma planilha .xlsx e retorna array de objetos (uma entrada por linha válida).
 * A primeira linha é tratada como cabeçalho.
 *
 * @param {string} caminho  Caminho absoluto ou relativo ao arquivo .xlsx.
 * @returns {Promise<Array<{
 *   participante: string|null,
 *   jogo: number|null,
 *   gols_casa: number|null,
 *   gols_fora: number|null,
 *   time_casa: string|null,
 *   time_fora: string|null,
 *   pen_casa: number|null,
 *   pen_fora: number|null,
 * }>>}
 */
export async function leLinhasPlanilha(caminho) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);

  const ws = wb.getWorksheet('Palpites');
  if (!ws) throw new Error('Aba "Palpites" não encontrada na planilha.');

  // Mapeia nome da coluna → índice (1-based) a partir do cabeçalho (linha 1)
  const cabecalho = {};
  ws.getRow(1).eachCell((cell, colIdx) => {
    const nome = String(cell.value ?? '').trim().toLowerCase();
    if (nome) cabecalho[nome] = colIdx;
  });

  const col = (nome) => cabecalho[nome] ?? null;

  const linhas = [];

  ws.eachRow((row, rowIdx) => {
    if (rowIdx === 1) return; // pula cabeçalho

    // Função auxiliar: lê célula pelo nome da coluna
    const get = (nome) => {
      const idx = col(nome);
      if (!idx) return undefined;
      const cell = row.getCell(idx);
      // ExcelJS retorna { text, hyperlink } para células rich-text; simplifica
      if (cell.value && typeof cell.value === 'object' && 'text' in cell.value) {
        return cell.value.text;
      }
      return cell.value;
    };

    const participante = txtOuNull(get('participante'));
    const jogo         = numOuNull(get('jogo'));

    // Linha vazia: ignora
    if (participante === null && jogo === null) return;

    linhas.push({
      participante,
      jogo,
      gols_casa: numOuNull(get('gols_casa')),
      gols_fora: numOuNull(get('gols_fora')),
      time_casa: txtOuNull(get('time_casa')),
      time_fora: txtOuNull(get('time_fora')),
      pen_casa:  numOuNull(get('pen_casa')),
      pen_fora:  numOuNull(get('pen_fora')),
    });
  });

  return linhas;
}

/**
 * Importa os palpites para o banco a partir de linhas já lidas.
 * Função pura (testável com db :memory:).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Array} linhas  Saída de leLinhasPlanilha() ou array equivalente.
 * @returns {{ importados: number, erros: Array<{linha: number, erro: string}> }}
 */
export function importaLinhas(db, linhas) {
  // Cache nome → id para evitar SELECT repetido e criar uma vez por nome
  const cacheIds = {};

  /**
   * Retorna o id do participante, criando-o se ainda não existir.
   * Retorna null se o nome for inválido.
   */
  function resolveParticipante(nome) {
    if (!nome) return null;
    if (cacheIds[nome] !== undefined) return cacheIds[nome];

    // Tenta buscar pelo nome
    const existente = db.prepare('SELECT id FROM jogadores WHERE nome = ?').get(nome);
    if (existente) {
      cacheIds[nome] = existente.id;
      return existente.id;
    }

    // Cria novo participante
    const res = criaParticipante(db, { nome });
    if (!res.ok) {
      cacheIds[nome] = null; // marca como falhou para não tentar de novo
      return null;
    }
    cacheIds[nome] = res.id;
    return res.id;
  }

  /**
   * Determina a fase do jogo pelo número.
   * Jogos 1–48 são grupos na Copa 2026; a partir de 49, mata-mata.
   * (Usa o banco para buscar a fase real, com fallback conservador.)
   */
  function faseDoJogo(jogoNumero) {
    const jogo = db.prepare('SELECT fase FROM jogos WHERE numero = ?').get(jogoNumero);
    // Se o jogo não existe no banco ainda, assume mata-mata (mais restritivo)
    return jogo ? jogo.fase : 'mata-mata';
  }

  let importados = 0;
  const erros = [];

  // Agrupa linhas por participante para chamar salvaPalpitesJogador uma vez por jogador
  // (otimização: evita abrir uma transação por linha)
  const porParticipante = {};
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const linhaNum = i + 2; // +2 porque linha 1 é cabeçalho

    if (!linha.participante) {
      erros.push({ linha: linhaNum, erro: 'Campo "participante" vazio.' });
      continue;
    }
    if (linha.jogo === null) {
      erros.push({ linha: linhaNum, erro: 'Campo "jogo" vazio ou inválido.' });
      continue;
    }

    const nome = linha.participante;
    if (!porParticipante[nome]) porParticipante[nome] = [];
    porParticipante[nome].push({ linha: linhaNum, dados: linha });
  }

  // Processa participante por participante
  for (const [nome, entradas] of Object.entries(porParticipante)) {
    const jogadorId = resolveParticipante(nome);
    if (!jogadorId) {
      for (const { linha } of entradas) {
        erros.push({ linha, erro: `Não foi possível criar/encontrar participante "${nome}".` });
      }
      continue;
    }

    const porJogo = [];
    for (const { linha, dados } of entradas) {
      const fase = faseDoJogo(dados.jogo);
      porJogo.push({
        jogo_numero:   dados.jogo,
        fase,
        gols_casa:     dados.gols_casa,
        gols_fora:     dados.gols_fora,
        // Mata-mata: repassa times e pênaltis; grupos: salvaPalpitesJogador os ignora
        time_casa:     dados.time_casa,
        time_fora:     dados.time_fora,
        penaltis_casa: dados.pen_casa,
        penaltis_fora: dados.pen_fora,
      });
    }

    const res = salvaPalpitesJogador(db, jogadorId, { porJogo });
    if (res.ok) {
      importados += entradas.length;
    } else {
      for (const { linha } of entradas) {
        erros.push({ linha, erro: res.erro });
      }
    }
  }

  return { importados, erros };
}

/**
 * Função principal: lê planilha e importa para o banco.
 * Exportada para reuso (ex.: rota de upload no futuro).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} caminho
 * @returns {Promise<{ importados: number, erros: Array }>}
 */
export async function importaPlanilha(db, caminho) {
  const linhas = await leLinhasPlanilha(caminho);
  return importaLinhas(db, linhas);
}

// ---- Execução direta (CLI) ----
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { getDb } = await import('../src/db.js');

  const caminho = process.argv[2] ?? join(__dirname, '..', 'exemplo', 'palpites-modelo.xlsx');
  console.log(`Importando: ${caminho}`);

  const db = getDb();
  const { importados, erros } = await importaPlanilha(db, caminho);

  console.log(`\nImportados: ${importados} palpite(s).`);
  if (erros.length > 0) {
    console.warn(`\nErros encontrados (${erros.length}):`);
    for (const { linha, erro } of erros) {
      console.warn(`  Linha ${linha}: ${erro}`);
    }
  } else {
    console.log('Nenhum erro.');
  }
}
