import { getDb, setConfig } from './db.js';
import { codigoDaTla, codigoDoIngles, codigoDoNome } from './flags.js';

// Fonte do minuto + autores dos gols ao vivo: API publica da ESPN (gratis, sem
// chave). Traz minuto correndo, autores dos gols e estado do jogo (ao vivo /
// encerrado). Alimenta /jogos e /artilheiros.
const SCOREBOARD_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const COPA = '20260611-20260719'; // intervalo da Copa inteira (so no backfill)

// Janela recente (~ontem a amanha) para os ciclos normais: leve, cobre os jogos
// ao vivo e os recem-encerrados sem baixar os 104 jogos toda vez.
function janelaRecente() {
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
  const agora = Date.now();
  return `${fmt(agora - 36 * 3600 * 1000)}-${fmt(agora + 24 * 3600 * 1000)}`;
}
const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=';
const CONFIG_KEY = 'aovivo_detalhe';
const SIG_KEY = 'aovivo_sig';

// ISO do time a partir do que a ESPN manda: sigla (FIFA) tem prioridade; o nome
// ingles cobre o resto (ex.: Uruguai, cuja sigla a ESPN escreve diferente).
function isoEspn(team) {
  if (!team) return null;
  return codigoDaTla(team.abbreviation) || codigoDoIngles(team.displayName) || codigoDoNome(team.displayName) || null;
}

// minuto + acrescimo a partir do displayClock da ESPN ("68'", "45+2'", "90'+3'").
export function parseMinuto(displayClock) {
  if (!displayClock) return { minuto: null, acrescimo: 0 };
  const m = String(displayClock).match(/(\d+)(?:\D+(\d+))?/);
  if (!m) return { minuto: null, acrescimo: 0 };
  return { minuto: +m[1], acrescimo: m[2] ? +m[2] : 0 };
}

// indice par-de-ISO -> { numero, homeCode }: grupos pelo fixture + mata-mata
// pelos times ja lancados em resultados.
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

// status da ESPN -> nosso ('IN_PLAY' | 'PAUSED' | 'FINISHED').
function statusEspn(stType) {
  const desc = ((stType && stType.description) || '').toLowerCase();
  if (desc.includes('halftime') || desc.includes('half-time')) return 'PAUSED';
  if ((stType && stType.state) === 'post') return 'FINISHED';
  return 'IN_PLAY';
}

// Extrai os gols (autor + minuto) do summary da ESPN, orientados pelo NOSSO mando.
export function golsDoSummary(summary, espnHomeId, mesmoMando) {
  const golsCasa = [];
  const golsFora = [];
  for (const k of (summary && summary.keyEvents) || []) {
    if (!k.scoringPlay) continue; // so jogadas que viraram gol
    const pm = parseMinuto(k.clock && k.clock.displayValue);
    const ath = k.participants && k.participants[0] && k.participants[0].athlete;
    const nome = (ath && ath.displayName) || (k.shortText || '').replace(/\s*Goal.*$/i, '') || '?';
    const txt = (k.text || '').toLowerCase();
    const tipo = /own goal/.test(txt) ? 'OWN' : /penalt/.test(txt) ? 'PENALTY' : 'REGULAR';
    const apiHomeMarcou = k.team && String(k.team.id) === String(espnHomeId);
    const lado = apiHomeMarcou === mesmoMando ? golsCasa : golsFora;
    lado.push({ min: pm.minuto, ac: pm.acrescimo, nome, tipo });
  }
  const ord = (a, b) => (a.min || 0) - (b.min || 0) || (a.ac || 0) - (b.ac || 0);
  golsCasa.sort(ord);
  golsFora.sort(ord);
  return { golsCasa, golsFora };
}

// Extrai os cartoes (amarelo/vermelho) do summary, orientados pelo NOSSO mando.
// cor: 'A' (amarelo) | 'V' (vermelho; inclui 2o amarelo = yellow-red-card).
export function cartoesDoSummary(summary, espnHomeId, mesmoMando) {
  const casa = [];
  const fora = [];
  for (const k of (summary && summary.keyEvents) || []) {
    const t = (k.type && k.type.type) || '';
    if (!/card/.test(t)) continue; // yellow-card | red-card | yellow-red-card
    const pm = parseMinuto(k.clock && k.clock.displayValue);
    const ath = k.participants && k.participants[0] && k.participants[0].athlete;
    const nome = (ath && ath.displayName) || '?';
    const cor = /red/.test(t) ? 'V' : 'A';
    const apiHome = k.team && String(k.team.id) === String(espnHomeId);
    const lado = apiHome === mesmoMando ? casa : fora;
    lado.push({ min: pm.minuto, ac: pm.acrescimo, nome, cor });
  }
  const ord = (a, b) => (a.min || 0) - (b.min || 0) || (a.ac || 0) - (b.ac || 0);
  casa.sort(ord);
  fora.sort(ord);
  return { cartoesCasa: casa, cartoesFora: fora };
}

// Curiosidades do jogo (estatisticas do boxscore) de um time -> objeto enxuto.
function leStats(teamBox) {
  const out = {};
  for (const s of (teamBox && teamBox.statistics) || []) out[s.name] = s.displayValue;
  const num = (v) => (v == null || v === '' ? null : Number(v));
  const pct = out.possessionPct != null ? Math.round(parseFloat(out.possessionPct)) : null;
  return {
    posse: Number.isFinite(pct) ? pct : null,
    chutes: num(out.totalShots),
    noGol: num(out.shotsOnTarget),
    defesas: num(out.saves),
    escanteios: num(out.wonCorners),
  };
}

// Estatisticas do jogo (boxscore) orientadas pelo NOSSO mando. Dado estruturado
// (casa por team.id), confiavel. Devolve { casa, fora } ou null se nao veio nada.
export function estatisticasDoSummary(summary, espnHomeId, mesmoMando) {
  const teams = (summary && summary.boxscore && summary.boxscore.teams) || [];
  if (teams.length < 2) return null;
  const homeBox = teams.find((t) => String(t.team && t.team.id) === String(espnHomeId));
  const awayBox = teams.find((t) => t !== homeBox);
  if (!homeBox || !awayBox) return null;
  const casa = leStats(mesmoMando ? homeBox : awayBox);
  const fora = leStats(mesmoMando ? awayBox : homeBox);
  const algo = [...Object.values(casa), ...Object.values(fora)].some((v) => v != null);
  return algo ? { casa, fora } : null;
}

// Bolas na trave a partir do TEXTO do commentary. A ESPN usa um gabarito fixo:
// "<Jogador> (<Time>) hits the [left/right] bar|post|crossbar with...". Uma so
// regex de captura cobre deteccao + extracao; se o texto nao casa, ignora
// (melhor faltar que errar). O nome do time pode divergir do nosso ISO, entao
// nao orientamos o lado (casa/fora).
const TRAVE_RE = /^(.+?)\s*\(([^)]+)\)\s+hits the (?:left |right )?(?:bar|post|crossbar|woodwork)\b/i;
export function travesDoSummary(summary) {
  const out = [];
  for (const c of (summary && summary.commentary) || []) {
    const m = (c.text || '').match(TRAVE_RE);
    if (!m) continue;
    const pm = parseMinuto(c.time && c.time.displayValue);
    out.push({ min: pm.minuto, ac: pm.acrescimo, nome: m[1].trim(), time: m[2].trim() });
  }
  out.sort((a, b) => (a.min || 0) - (b.min || 0) || (a.ac || 0) - (b.ac || 0));
  return out;
}

// Assinatura SEM o minuto cru (que correria todo segundo): muda quando entra um
// gol, vira o status, bate uma trave OU as estatisticas do jogo evoluem (posse/
// finalizacoes/no gol). Como o miolo so e rebuscado a cada ciclo do agendador e
// a troca na tela e suave, incluir as estatisticas as deixa "ao vivo" sem custo
// de rede extra (a tela ja faz polling). Entra na versao do auto-refresh.
function resumoEstat(e) {
  if (!e) return '';
  const lado = (s) => `${s.posse}/${s.chutes}/${s.noGol}`;
  return `${lado(e.casa)}-${lado(e.fora)}`;
}
function assinatura(detalhe) {
  return Object.keys(detalhe)
    .sort((a, b) => a - b)
    .map((n) => {
      const d = detalhe[n];
      const gols = [...d.golsCasa, ...d.golsFora].map((g) => `${g.min}${g.nome}`).join(',');
      const cards = [...(d.cartoesCasa || []), ...(d.cartoesFora || [])].map((c) => `${c.min}${c.cor}${c.nome}`).join(',');
      const traves = (d.traves || []).map((t) => `${t.min}${t.nome}`).join(',');
      // estatisticas so contam p/ a assinatura enquanto o jogo rola; depois de
      // encerrado ficam fixas e nao precisam mais mexer na versao.
      const estat = d.status === 'FINISHED' ? '' : resumoEstat(d.estat);
      return `${n}:${d.status}:${gols}:${cards}:${traves}:${estat}`;
    })
    .join(';');
}

// Busca o scoreboard + o summary dos jogos ao vivo; grava { numero: detalhe }.
export async function sincronizaEspn(db, fetchFn = fetch, dates = COPA) {
  const sb = await (await fetchFn(`${SCOREBOARD_BASE}?dates=${dates}&limit=400`)).json();
  const idx = indicePorPar(db);
  // MESCLA com o que ja temos: jogos encerrados ficam guardados (autores
  // continuam aparecendo na lista mesmo depois do apito final).
  const detalhe = { ...leDetalhes(db) };
  const agora = new Date().toISOString();
  // o PLACAR ao vivo vem da ESPN (scoreboard) — grava em resultados_ao_vivo.
  // Manual (admin) ainda sobrepoe.
  const upScore = db.prepare(
    'INSERT INTO resultados_ao_vivo (jogo_numero, gols_casa, gols_fora, status, atualizado_em) ' +
      'VALUES (?, ?, ?, ?, ?) ON CONFLICT(jogo_numero) DO UPDATE SET ' +
      'gols_casa=excluded.gols_casa, gols_fora=excluded.gols_fora, status=excluded.status, atualizado_em=excluded.atualizado_em',
  );
  let n = 0;
  for (const ev of (sb && sb.events) || []) {
    const comp = ev.competitions && ev.competitions[0];
    const stType = ev.status && ev.status.type;
    const state = stType && stType.state; // 'pre' | 'in' | 'post'
    if (!comp || (state !== 'in' && state !== 'post')) continue; // rolando ou encerrado
    const comps = comp.competitors || [];
    const home = comps.find((c) => c.homeAway === 'home');
    const away = comps.find((c) => c.homeAway === 'away');
    if (!home || !away) continue;
    const hIso = isoEspn(home.team);
    const aIso = isoEspn(away.team);
    if (!hIso || !aIso) continue;
    const entry = idx.get([hIso, aIso].sort().join('-'));
    if (!entry) continue;
    const mesmoMando = entry.homeCode === hIso;
    const status = statusEspn(stType);
    // placar BASE do scoreboard (orientado pelo nosso mando). Atencao: o
    // scoreboard as vezes ATRASA um gol em relacao ao summary (keyEvents) — o gol
    // ja aparece nos autores mas o placar ainda nao virou. Por isso, quando
    // buscamos o summary, derivamos o placar da CONTAGEM de gols (mesma fonte dos
    // autores): assim placar e autores nunca divergem e a animacao dispara certo.
    const hS = parseInt(home.score, 10);
    const aS = parseInt(away.score, 10);
    let pCasa = mesmoMando ? hS : aS;
    let pFora = mesmoMando ? aS : hS;
    const ant = detalhe[entry.numero];
    // ja encerrado E ja com as curiosidades (estatisticas) capturadas -> nao
    // refaz o summary; o placar final ja esta gravado (so reforca pelo scoreboard).
    if (state === 'post' && ant && ant.status === 'FINISHED' && ant.estat !== undefined) {
      if (Number.isInteger(pCasa) && Number.isInteger(pFora)) {
        upScore.run(entry.numero, pCasa, pFora, status, agora);
      }
      continue;
    }
    const pm = parseMinuto(ev.status.displayClock);
    let gols = { golsCasa: (ant && ant.golsCasa) || [], golsFora: (ant && ant.golsFora) || [] };
    let cartoes = { cartoesCasa: (ant && ant.cartoesCasa) || [], cartoesFora: (ant && ant.cartoesFora) || [] };
    let estat = ant ? ant.estat : null;
    let traves = (ant && ant.traves) || [];
    try {
      const sum = await (await fetchFn(SUMMARY + ev.id)).json();
      gols = golsDoSummary(sum, home.team.id, mesmoMando);
      cartoes = cartoesDoSummary(sum, home.team.id, mesmoMando);
      estat = estatisticasDoSummary(sum, home.team.id, mesmoMando);
      traves = travesDoSummary(sum);
    } catch (e) {
      /* mantem autores/cartoes/curiosidades anteriores */
    }
    // placar = contagem de gols do summary (consistente com os autores; o gol
    // contra a ESPN credita ao time beneficiado, entao a contagem fica certa). So
    // sobrescreve o scoreboard quando o summary trouxe algum gol.
    const cCasa = gols.golsCasa.length;
    const cFora = gols.golsFora.length;
    if (cCasa || cFora) {
      pCasa = cCasa;
      pFora = cFora;
    }
    if (Number.isInteger(pCasa) && Number.isInteger(pFora)) {
      upScore.run(entry.numero, pCasa, pFora, status, agora);
    }
    detalhe[entry.numero] = {
      numero: entry.numero,
      minuto: state === 'post' ? null : pm.minuto,
      acrescimo: state === 'post' ? 0 : pm.acrescimo,
      status,
      golsCasa: gols.golsCasa,
      golsFora: gols.golsFora,
      cartoesCasa: cartoes.cartoesCasa,
      cartoesFora: cartoes.cartoesFora,
      estat: estat ?? null,
      traves,
    };
    n += 1;
  }
  setConfig(CONFIG_KEY, JSON.stringify(detalhe));
  setConfig(SIG_KEY, assinatura(detalhe));
  return n;
}

// Le o mapa de detalhes do config (sempre devolve objeto).
export function leDetalhes(db = getDb()) {
  try {
    const raw = db.prepare('SELECT valor FROM config WHERE chave = ?').get(CONFIG_KEY);
    return raw ? JSON.parse(raw.valor) : {};
  } catch (e) {
    return {};
  }
}

// Agendador: a cada 60s busca minuto + autores na ESPN (gratis, sem token).
export function iniciaAgendadorDetalheVivo(db = getDb(), { intervaloMs = 60000 } = {}) {
  let backfillFeito = false;
  const ciclo = async () => {
    try {
      // 1o ciclo: varre a Copa inteira (backfill dos encerrados). Depois: so a
      // janela recente (leve) — os antigos ja estao gravados no banco.
      const n = await sincronizaEspn(db, fetch, backfillFeito ? janelaRecente() : COPA);
      backfillFeito = true;
      if (n) console.log(`Detalhe ao vivo (ESPN): ${n} jogo(s) com minuto/autores.`);
    } catch (e) {
      console.error('Detalhe ao vivo (ESPN): erro no ciclo —', e.message);
    }
  };
  ciclo();
  return setInterval(ciclo, intervaloMs);
}
