// Motor de pontuacao do bolao — funcoes puras, sem efeitos colaterais.
// Regras do regulamento da Copa da Familia 2026.
import { canoniza } from './jogadores-fut.js';

export const VALORES = {
  // placar de qualquer partida (grupos e mata-mata)
  exato: 35,
  resultadoMaisGol: 20, // acertou vencedor/empate + nº de gols de UMA equipe
  resultado: 10, //         acertou vencedor/empate, sem acertar gols
  soGol: 5, //              errou o resultado, mas acertou o gol de UMA equipe
  // bonus de mata-mata por fase: [confronto certo, cada selecao na posicao certa]
  bonus: {
    '1/16': { confronto: 30, selecao: 15 },
    oitavas: { confronto: 50, selecao: 25 },
    quartas: { confronto: 75, selecao: 35 },
    semis: { confronto: 100, selecao: 50 },
  },
  // especiais
  artilheiro: 100,
  finalistas: 200,
  campeao: 500,
};

const FASES_COM_BONUS = new Set(['1/16', 'oitavas', 'quartas', 'semis']);

// Normaliza nome de selecao para comparacao robusta entre planilhas/admin.
// Remove acentos, pontuacao e variacoes conhecidas. NAO funde Suica x Suecia.
const SINONIMOS = {
  qatar: 'catar',
  curacau: 'curacao',
  'rep tcheca': 'republica tcheca',
  tcheca: 'republica tcheca',
  'bosnia hezerg': 'bosnia',
  'bosnia herzegovina': 'bosnia',
  'eua': 'estados unidos',
  'rd congo': 'congo',
  panama: 'panama',
};

export function normalizaTime(nome) {
  if (nome == null) return null;
  let s = String(nome)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acentos
    .toLowerCase()
    .replace(/[.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (SINONIMOS[s]) s = SINONIMOS[s];
  return s || null;
}

function mesmoTime(a, b) {
  const na = normalizaTime(a);
  const nb = normalizaTime(b);
  return na != null && nb != null && na === nb;
}

// Artilheiro e nome de JOGADOR (texto livre). Compara pelo nome CANONICO — o
// mesmo mapa do /artilheiros (canoniza) — pra "Mbape"/"Kylian Mbappe"/"Mbappe"
// baterem com o artilheiro oficial. Mantem a pontuacao alinhada a exibicao.
function mesmoArtilheiro(a, b) {
  const ca = canoniza(a);
  const cb = canoniza(b);
  return ca != null && cb != null && ca.nome === cb.nome;
}

function resultado(casa, fora) {
  if (casa > fora) return 'casa';
  if (casa < fora) return 'fora';
  return 'empate';
}

// Pontos do placar de uma partida. palpite/real = {gols_casa, gols_fora}.
// Camadas mutuamente exclusivas — retorna o maior nivel atingido.
export function pontosPlacar(palpite, real) {
  if (!palpite || !real) return 0;
  const { gols_casa: pc, gols_fora: pf } = palpite;
  const { gols_casa: rc, gols_fora: rf } = real;
  if ([pc, pf, rc, rf].some((v) => v == null)) return 0;

  if (pc === rc && pf === rf) return VALORES.exato;

  const mesmoResultado = resultado(pc, pf) === resultado(rc, rf);
  const acertouUmGol = pc === rc || pf === rf;

  if (mesmoResultado && acertouUmGol) return VALORES.resultadoMaisGol;
  if (mesmoResultado) return VALORES.resultado;
  if (acertouUmGol) return VALORES.soGol;
  return 0;
}

// Bonus de mata-mata para uma chave. O MANDO IMPORTA: cada selecao so pontua
// se estiver no lado correto (mandante x visitante). Time certo no lado errado
// nao pontua, e o confronto so conta com as duas selecoes nos lados certos.
// palpite/real = {time_casa, time_fora}. Retorna {confronto, selecao, total}.
export function bonusMataMata(fase, palpite, real) {
  const zero = { confronto: 0, selecao: 0, total: 0 };
  if (!FASES_COM_BONUS.has(fase) || !palpite || !real) return zero;
  const valores = VALORES.bonus[fase];

  if (!real.time_casa || !real.time_fora || !palpite.time_casa || !palpite.time_fora) {
    return zero;
  }

  const acertoCasa = mesmoTime(palpite.time_casa, real.time_casa);
  const acertoFora = mesmoTime(palpite.time_fora, real.time_fora);
  const acertos = (acertoCasa ? 1 : 0) + (acertoFora ? 1 : 0);

  const selecao = acertos * valores.selecao;
  const confronto = acertos === 2 ? valores.confronto : 0;
  return { confronto, selecao, total: confronto + selecao };
}

// Pontos especiais. palpite = {artilheiro, campeao, finalista_1, finalista_2}.
// real = {artilheiro, campeao, finalistas: [t1, t2]}.
export function pontosEspeciais(palpite, real) {
  let artilheiro = 0;
  let finalistas = 0;
  let campeao = 0;
  if (!palpite || !real) return { artilheiro, finalistas, campeao, total: 0 };

  if (mesmoArtilheiro(palpite.artilheiro, real.artilheiro)) {
    artilheiro = VALORES.artilheiro;
  }
  if (mesmoTime(palpite.campeao, real.campeao)) {
    campeao = VALORES.campeao;
  }
  const finaisReais = (real.finalistas || []).filter((t) => t != null);
  const finaisPalpite = [palpite.finalista_1, palpite.finalista_2].filter((t) => t != null);
  if (finaisReais.length === 2 && finaisPalpite.length === 2) {
    const usados = [];
    let acertos = 0;
    for (const r of finaisReais) {
      const idx = finaisPalpite.findIndex((p, i) => !usados.includes(i) && mesmoTime(p, r));
      if (idx !== -1) {
        usados.push(idx);
        acertos += 1;
      }
    }
    if (acertos === 2) finalistas = VALORES.finalistas;
  }
  return { artilheiro, finalistas, campeao, total: artilheiro + finalistas + campeao };
}
