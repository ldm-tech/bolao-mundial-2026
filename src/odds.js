import { getDb } from './db.js';
import { codigoDaTla, codigoDoIngles, codigoDoNome } from './flags.js';

// Fonte ao vivo de odds: API publica da ESPN (gratis, sem chave).
const SCOREBOARD_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const COPA = '20260611-20260719';
const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=';

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

// ---------- Mercado (ESPN pickcenter / moneylines americanos) ----------
// Funcao PURA: summary ESPN + ID da casa ESPN + flag de mando -> { pCasa, pEmpate, pFora } ou null.
//
// Conversao moneyline americano -> probabilidade implicita:
//   ML < 0:  p = (-ML) / (-ML + 100)
//   ML > 0:  p = 100  / (ML  + 100)
//
// As tres probabilidades (home/draw/away) sao normalizadas para somar exatamente 1
// (remove a margem/vig do operador).
//
// Orientacao de casa/fora: se mesmoMando=true, ESPN-home = NOSSO casa;
// caso contrario, as probabilidades sao trocadas.
export function probsDeMercado(summary, espnHomeId, mesmoMando) {
  const pc = summary && summary.pickcenter && summary.pickcenter[0];
  if (!pc) return null;

  const mlHome = pc.homeTeamOdds && pc.homeTeamOdds.moneyLine;
  const mlAway = pc.awayTeamOdds && pc.awayTeamOdds.moneyLine;
  const mlDraw = pc.drawOdds && pc.drawOdds.moneyLine;

  if (mlHome == null || mlAway == null || mlDraw == null) return null;

  const mlToProb = (ml) => (ml < 0 ? (-ml) / (-ml + 100) : 100 / (ml + 100));

  const pH = mlToProb(mlHome);
  const pD = mlToProb(mlDraw);
  const pA = mlToProb(mlAway);
  const s = pH + pD + pA;
  if (s <= 0) return null;

  const normH = pH / s;
  const normD = pD / s;
  const normA = pA / s;

  // Orienta pelo nosso mando
  if (mesmoMando) {
    return { pCasa: normH, pEmpate: normD, pFora: normA };
  } else {
    return { pCasa: normA, pEmpate: normD, pFora: normH };
  }
}

// ---------- Utilitarios internos ----------

// ISO do time a partir do que a ESPN manda (mesma logica de detalhevivo.js).
function isoEspn(team) {
  if (!team) return null;
  return codigoDaTla(team.abbreviation) || codigoDoIngles(team.displayName) || codigoDoNome(team.displayName) || null;
}

// Indice par-de-ISO -> { numero, homeCode }: grupos pelo fixture + mata-mata pelos times lancados.
function indicePorPar(db) {
  const idx = new Map();
  const add = (numero, casa, fora) => {
    const h = codigoDoNome(casa);
    const a = codigoDoNome(fora);
    if (!h || !a) return;
    idx.set([h, a].sort().join('-'), { numero, homeCode: h });
  };
  for (const j of db.prepare("SELECT numero, time_casa, time_fora FROM jogos WHERE fase='grupos'").all()) {
    add(j.numero, j.time_casa, j.time_fora);
  }
  for (const r of db
    .prepare('SELECT jogo_numero, time_casa, time_fora FROM resultados WHERE time_casa IS NOT NULL AND time_fora IS NOT NULL')
    .all()) {
    add(r.jogo_numero, r.time_casa, r.time_fora);
  }
  return idx;
}

const upsertOdds = (db) =>
  db.prepare(`
    INSERT INTO odds_mercado (jogo_numero, prob_casa, prob_empate, prob_fora, atualizado_em)
    VALUES (@jogo_numero, @prob_casa, @prob_empate, @prob_fora, @atualizado_em)
    ON CONFLICT(jogo_numero) DO UPDATE SET
      prob_casa=excluded.prob_casa, prob_empate=excluded.prob_empate,
      prob_fora=excluded.prob_fora, atualizado_em=excluded.atualizado_em`);

// Busca, calcula e grava as odds de mercado via ESPN. Retorna quantos jogos gravou.
// So busca o summary de jogos ainda relevantes (nao encerrados ou recentemente encerrados).
export async function sincronizaOdds(db, fetchFn = fetch) {
  const sb = await (await fetchFn(`${SCOREBOARD_BASE}?dates=${COPA}&limit=400`)).json();
  const idx = indicePorPar(db);
  const agora = new Date().toISOString();

  // 1a passagem: seleciona os eventos elegiveis (que casam com os nossos jogos).
  // Inclui jogos encerrados (post): a ESPN mantem as odds de fechamento, que
  // aparecem na tela como referencia historica do que o mercado esperava.
  const elegiveis = [];
  for (const ev of (sb && sb.events) || []) {
    const comp = ev.competitions && ev.competitions[0];
    if (!comp) continue;

    const comps = comp.competitors || [];
    const home = comps.find((c) => c.homeAway === 'home');
    const away = comps.find((c) => c.homeAway === 'away');
    if (!home || !away) continue;

    const hIso = isoEspn(home.team);
    const aIso = isoEspn(away.team);
    if (!hIso || !aIso) continue;

    const entry = idx.get([hIso, aIso].sort().join('-'));
    if (!entry) continue;

    elegiveis.push({ id: ev.id, homeId: home.team.id, mesmoMando: entry.homeCode === hIso, numero: entry.numero });
  }

  // 2a passagem: busca os summaries em LOTES paralelos (rapido — sequencial levava
  // ~20s p/ a Copa toda; em lotes cai p/ poucos segundos, e as odds aparecem logo).
  const linhas = [];
  const LOTE = 8;
  for (let i = 0; i < elegiveis.length; i += LOTE) {
    const res = await Promise.all(
      elegiveis.slice(i, i + LOTE).map(async (e) => {
        try {
          const summary = await (await fetchFn(SUMMARY + e.id)).json();
          const p = probsDeMercado(summary, e.homeId, e.mesmoMando);
          if (!p) return null;
          return { jogo_numero: e.numero, prob_casa: p.pCasa, prob_empate: p.pEmpate, prob_fora: p.pFora, atualizado_em: agora };
        } catch (e) {
          return null; // sem summary/odds, pula
        }
      }),
    );
    for (const r of res) if (r) linhas.push(r);
  }

  // 3a passagem: grava tudo num unico tx sincrono (better-sqlite3 nao aceita async)
  const stmt = upsertOdds(db);
  const tx = db.transaction(() => {
    for (const row of linhas) stmt.run(row);
  });
  tx();
  return linhas.length;
}

// Agendador: roda a cada intervalo (padrao 6h). Fonte ESPN, sem token necessario.
export function iniciaAgendadorOdds(db = getDb(), { intervaloMs = 6 * 60 * 60 * 1000 } = {}) {
  const ciclo = async () => {
    try {
      const n = await sincronizaOdds(db);
      console.log(`Odds de mercado (ESPN): ${n} jogo(s) atualizado(s).`);
    } catch (e) {
      console.error('Odds de mercado (ESPN): erro no ciclo —', e.message);
    }
  };
  ciclo();
  return setInterval(ciclo, intervaloMs);
}
