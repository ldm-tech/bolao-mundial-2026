import { getDb } from './db.js';
import { codigoDoNome, codigoDoIngles } from './flags.js';

const BASE = 'https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/';

// ---------- Odds do bolao (a partir dos palpites) ----------
// Map(jogo_numero -> { casa, empate, fora, total }) com as contagens de resultado.
export function oddsBolao(db = getDb()) {
  const out = new Map();
  for (const p of db
    .prepare('SELECT jogo_numero, gols_casa, gols_fora FROM palpites WHERE gols_casa IS NOT NULL AND gols_fora IS NOT NULL')
    .all()) {
    if (!out.has(p.jogo_numero)) out.set(p.jogo_numero, { casa: 0, empate: 0, fora: 0, total: 0 });
    const o = out.get(p.jogo_numero);
    if (p.gols_casa > p.gols_fora) o.casa += 1;
    else if (p.gols_casa < p.gols_fora) o.fora += 1;
    else o.empate += 1;
    o.total += 1;
  }
  return out;
}

// ---------- Mercado (the-odds-api) ----------
// Funcao PURA: 1 match -> { homeCode, awayCode, pHome, pDraw, pAway } ou null.
// Media das casas, cada uma normalizada para somar 1 (remove a margem/vig).
export function probsDeMercado(match) {
  const homeCode = codigoDoIngles(match?.home_team);
  const awayCode = codigoDoIngles(match?.away_team);
  if (!homeCode || !awayCode) return null;
  let sh = 0;
  let sd = 0;
  let sa = 0;
  let n = 0;
  for (const bk of match.bookmakers || []) {
    const mk = (bk.markets || []).find((m) => m.key === 'h2h');
    if (!mk) continue;
    let oh;
    let od;
    let oa;
    for (const o of mk.outcomes || []) {
      if (o.name === match.home_team) oh = o.price;
      else if (o.name === match.away_team) oa = o.price;
      else if (o.name === 'Draw') od = o.price;
    }
    if (!oh || !od || !oa) continue;
    const ih = 1 / oh;
    const id = 1 / od;
    const ia = 1 / oa;
    const s = ih + id + ia;
    sh += ih / s;
    sd += id / s;
    sa += ia / s;
    n += 1;
  }
  if (n === 0) return null;
  return { homeCode, awayCode, pHome: sh / n, pDraw: sd / n, pAway: sa / n };
}

// Indice dos NOSSOS jogos por par de selecoes (ISO) -> { numero, casaCode }.
function indicePorPar(db) {
  const idx = new Map();
  const add = (numero, casa, fora) => {
    if (casa && fora) idx.set([casa, fora].sort().join('-'), { numero, casaCode: casa });
  };
  for (const j of db.prepare("SELECT numero, time_casa, time_fora FROM jogos WHERE fase='grupos'").all()) {
    add(j.numero, codigoDoNome(j.time_casa), codigoDoNome(j.time_fora));
  }
  for (const r of db
    .prepare('SELECT jogo_numero, time_casa, time_fora FROM resultados WHERE time_casa IS NOT NULL AND time_fora IS NOT NULL')
    .all()) {
    add(r.jogo_numero, codigoDoNome(r.time_casa), codigoDoNome(r.time_fora));
  }
  return idx;
}

async function buscar(token, fetchFn) {
  const url = `${BASE}?apiKey=${token}&regions=eu&markets=h2h&oddsFormat=decimal`;
  const resp = await fetchFn(url);
  if (!resp.ok) throw new Error(`the-odds-api HTTP ${resp.status}`);
  return resp.json();
}

const upsertOdds = (db) =>
  db.prepare(`
    INSERT INTO odds_mercado (jogo_numero, prob_casa, prob_empate, prob_fora, atualizado_em)
    VALUES (@jogo_numero, @prob_casa, @prob_empate, @prob_fora, @atualizado_em)
    ON CONFLICT(jogo_numero) DO UPDATE SET
      prob_casa=excluded.prob_casa, prob_empate=excluded.prob_empate,
      prob_fora=excluded.prob_fora, atualizado_em=excluded.atualizado_em`);

// Busca, calcula e grava as odds de mercado. Retorna quantos jogos gravou.
export async function sincronizaOdds(db, token, fetchFn = fetch) {
  const matches = await buscar(token, fetchFn);
  const idx = indicePorPar(db);
  const stmt = upsertOdds(db);
  const agora = new Date().toISOString();
  let n = 0;
  const tx = db.transaction(() => {
    for (const m of matches || []) {
      const p = probsDeMercado(m);
      if (!p) continue;
      const entry = idx.get([p.homeCode, p.awayCode].sort().join('-'));
      if (!entry) continue;
      const mesmoMando = entry.casaCode === p.homeCode;
      stmt.run({
        jogo_numero: entry.numero,
        prob_casa: mesmoMando ? p.pHome : p.pAway,
        prob_empate: p.pDraw,
        prob_fora: mesmoMando ? p.pAway : p.pHome,
        atualizado_em: agora,
      });
      n += 1;
    }
  });
  tx();
  return n;
}

// Agendador: roda a cada intervalo (padrao 6h) se houver token.
export function iniciaAgendadorOdds(db = getDb(), { intervaloMs = 6 * 60 * 60 * 1000 } = {}) {
  const token = process.env.BOLAO_ODDS_API_TOKEN;
  if (!token) {
    console.log('Odds de mercado: desligado (defina BOLAO_ODDS_API_TOKEN para ativar).');
    return null;
  }
  const ciclo = async () => {
    try {
      const n = await sincronizaOdds(db, token);
      console.log(`Odds de mercado: ${n} jogo(s) atualizado(s).`);
    } catch (e) {
      console.error('Odds de mercado: erro no ciclo —', e.message);
    }
  };
  ciclo();
  return setInterval(ciclo, intervaloMs);
}
