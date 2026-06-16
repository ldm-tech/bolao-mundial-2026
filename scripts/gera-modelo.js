/**
 * scripts/gera-modelo.js
 *
 * Gera o arquivo exemplo/palpites-modelo.xlsx com uma aba "Palpites"
 * contendo o cabeçalho e uma linha de exemplo (placeholder).
 *
 * Uso:
 *   node scripts/gera-modelo.js
 *
 * O arquivo gerado pode ser baixado pelo admin, preenchido offline
 * e depois importado com:
 *   node scripts/import-planilha.js caminho/da/planilha.xlsx
 */

import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(__dirname, '..', 'exemplo', 'palpites-modelo.xlsx');

// Garante que a pasta existe
mkdirSync(dirname(SAIDA), { recursive: true });

const wb = new ExcelJS.Workbook();
wb.creator = 'Bolão Copa 2026';
wb.created  = new Date();

const ws = wb.addWorksheet('Palpites');

// ---- Cabeçalho ----
// Colunas obrigatórias: participante, jogo, gols_casa, gols_fora
// Colunas de mata-mata (opcionais em jogos de grupos):
//   time_casa, time_fora, pen_casa, pen_fora
ws.columns = [
  { header: 'participante', key: 'participante', width: 22 },
  { header: 'jogo',         key: 'jogo',         width: 8  },
  { header: 'gols_casa',    key: 'gols_casa',    width: 12 },
  { header: 'gols_fora',    key: 'gols_fora',    width: 12 },
  { header: 'time_casa',    key: 'time_casa',    width: 16 },
  { header: 'time_fora',    key: 'time_fora',    width: 16 },
  { header: 'pen_casa',     key: 'pen_casa',     width: 12 },
  { header: 'pen_fora',     key: 'pen_fora',     width: 12 },
];

// Estilo do cabeçalho
ws.getRow(1).eachCell((cell) => {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = {
    bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } },
  };
});
ws.getRow(1).height = 22;

// ---- Linha de exemplo (placeholder) ----
// As colunas de mata-mata ficam em branco para jogos de grupos;
// em jogos de mata-mata, preencha time_casa, time_fora e (se houve pênaltis)
// pen_casa e pen_fora.
ws.addRow({
  participante: 'Fulano de Tal',  // nome do participante (único no bolão)
  jogo:         1,                // número do jogo (coluna "numero" em jogos)
  gols_casa:    2,                // palpite de gols do time da casa
  gols_fora:    1,                // palpite de gols do time de fora
  time_casa:    '',               // apenas mata-mata: sigla do time vencedor lado casa
  time_fora:    '',               // apenas mata-mata: sigla do time vencedor lado fora
  pen_casa:     '',               // apenas mata-mata com pênaltis: gols na disputa (casa)
  pen_fora:     '',               // apenas mata-mata com pênaltis: gols na disputa (fora)
});

// Estilo da linha de exemplo (cinza claro)
ws.getRow(2).eachCell((cell) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
});

// Congela a primeira linha (cabeçalho sempre visível)
ws.views = [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }];

await wb.xlsx.writeFile(SAIDA);
console.log(`Modelo gerado em: ${SAIDA}`);
