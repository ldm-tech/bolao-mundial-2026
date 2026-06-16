import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function carregaConfig() {
  const p = join(__dirname, '..', 'data', 'premiacao.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Posicao do "meio da tabela" = teto(N/2). 0 pagantes -> 0 (sem premio do meio).
export function posicaoMeio(nPagantes) {
  return nPagantes > 0 ? Math.ceil(nPagantes / 2) : 0;
}

// Resolve, para cada item da distribuicao, qual jogador ocupa a posicao.
// geral/faseGrupos: arrays ordenados com {id, nome, total, posicao}.
// Retorna { pool, premios: [{ chave, rotulo, pct, posicao, jogador|null, valorReais }] }.
export function calculaPremios({ cfg, geral, faseGrupos, nPagantes }) {
  const pool = (cfg.valorAposta || 0) * (nPagantes || 0);
  // O "meio da tabela" (consolacao) e baseado no nº de PARTICIPANTES (inscritos),
  // nao nos pagantes — assim o parcial ja aparece antes de marcar quem pagou.
  // (O nº de pagantes so afeta o valor em R$ do pool, exibido apenas no admin.)
  const meioPos = posicaoMeio(geral.length);
  const premios = cfg.distribuicao.map((d) => {
    let jogador = null;
    let posicao = d.posicao;
    if (d.fonte === 'geral') jogador = geral[d.posicao - 1] || null;
    else if (d.fonte === 'faseGrupos') jogador = faseGrupos[d.posicao - 1] || null;
    else if (d.fonte === 'meio') {
      posicao = meioPos;
      jogador = meioPos > 0 ? geral[meioPos - 1] || null : null;
    }
    return {
      chave: d.chave,
      rotulo: d.rotulo,
      pct: d.pct,
      posicao,
      jogador,
      valorReais: Math.round(pool * d.pct),
    };
  });
  return { pool, premios };
}
