import { getDb } from './db.js';
import { codigoDoNome, codigoDaTla } from './flags.js';

const URL_API = 'https://api.football-data.org/v4/competitions/WC/matches';

// stage da API football-data.org -> nossa fase
export const STAGE_PARA_FASE = {
  GROUP_STAGE: 'grupos',
  LAST_32: '1/16',
  LAST_16: 'oitavas',
  QUARTER_FINALS: 'quartas',
  SEMI_FINALS: 'semis',
  THIRD_PLACE: 'terceiro',
  FINAL: 'final',
};

export function chave(fase, codA, codB) {
  return `${fase}|${[codA, codB].sort().join('-')}`;
}

// Indice dos NOSSOS jogos: chave (fase + par de ISO) -> { numero, homeCode }.
// Grupos vem do fixture (times fixos). Mata-mata vem dos times reais lancados
// pelo admin em resultados (so casa depois que a chave foi definida).
export function construirIndice(db = getDb()) {
  const indice = new Map();
  for (const j of db.prepare("SELECT numero, time_casa, time_fora FROM jogos WHERE fase = 'grupos'").all()) {
    const h = codigoDoNome(j.time_casa);
    const a = codigoDoNome(j.time_fora);
    if (h && a) indice.set(chave('grupos', h, a), { numero: j.numero, homeCode: h });
  }
  const fasePorJogo = new Map(
    db.prepare('SELECT numero, fase FROM jogos').all().map((r) => [r.numero, r.fase]),
  );
  for (const r of db
    .prepare('SELECT jogo_numero, time_casa, time_fora FROM resultados WHERE time_casa IS NOT NULL AND time_fora IS NOT NULL')
    .all()) {
    const fase = fasePorJogo.get(r.jogo_numero);
    if (!fase || fase === 'grupos') continue;
    const h = codigoDoNome(r.time_casa);
    const a = codigoDoNome(r.time_fora);
    if (h && a) indice.set(chave(fase, h, a), { numero: r.jogo_numero, homeCode: h });
  }
  return indice;
}

// Funcao PURA: mapeia 1 match da API para { numero, gols_casa, gols_fora, status }
// ou null (sem fase conhecida, sem mapeamento, ou placar ainda nulo).
export function mapeiaJogo(match, indice) {
  const fase = STAGE_PARA_FASE[match?.stage];
  if (!fase) return null;
  const codCasa = codigoDaTla(match.homeTeam?.tla);
  const codFora = codigoDaTla(match.awayTeam?.tla);
  if (!codCasa || !codFora) return null;
  const entry = indice.get(chave(fase, codCasa, codFora));
  if (!entry) return null;
  const ft = match.score?.fullTime || {};
  if (ft.home == null || ft.away == null) return null; // jogo ainda nao comecou
  // orienta o placar pelo mando do NOSSO jogo
  const mesmoMando = entry.homeCode === codCasa;
  return {
    numero: entry.numero,
    gols_casa: mesmoMando ? ft.home : ft.away,
    gols_fora: mesmoMando ? ft.away : ft.home,
    status: match.status || null,
  };
}

async function buscarMatches(token, fetchFn) {
  const resp = await fetchFn(URL_API, { headers: { 'X-Auth-Token': token } });
  if (!resp.ok) throw new Error(`API football-data HTTP ${resp.status}`);
  const data = await resp.json();
  return data.matches || [];
}

const upsertAoVivo = (db) =>
  db.prepare(`
    INSERT INTO resultados_ao_vivo (jogo_numero, gols_casa, gols_fora, status, atualizado_em)
    VALUES (@jogo_numero, @gols_casa, @gols_fora, @status, @atualizado_em)
    ON CONFLICT(jogo_numero) DO UPDATE SET
      gols_casa=excluded.gols_casa, gols_fora=excluded.gols_fora,
      status=excluded.status, atualizado_em=excluded.atualizado_em`);

// Busca na API, mapeia e grava os placares ao vivo. Retorna quantos gravou.
export async function sincroniza(db, token, fetchFn = fetch) {
  const matches = await buscarMatches(token, fetchFn);
  const indice = construirIndice(db);
  const stmt = upsertAoVivo(db);
  const agora = new Date().toISOString();
  let n = 0;
  const tx = db.transaction(() => {
    for (const m of matches) {
      const r = mapeiaJogo(m, indice);
      if (!r) continue;
      stmt.run({
        jogo_numero: r.numero,
        gols_casa: r.gols_casa,
        gols_fora: r.gols_fora,
        status: r.status,
        atualizado_em: agora,
      });
      n += 1;
    }
  });
  tx();
  return n;
}

// Agendador: roda a sincronizacao a cada intervalo, se houver token.
export function iniciaAgendador(db = getDb(), { intervaloMs = 30000 } = {}) {
  const token = process.env.BOLAO_FOOTBALL_API_TOKEN;
  if (!token) {
    console.log('Placares ao vivo: desligado (defina BOLAO_FOOTBALL_API_TOKEN para ativar).');
    return null;
  }
  const ciclo = async () => {
    try {
      const n = await sincroniza(db, token);
      console.log(`Placares ao vivo: ${n} jogo(s) sincronizado(s).`);
    } catch (e) {
      console.error('Placares ao vivo: erro no ciclo —', e.message);
    }
  };
  ciclo();
  return setInterval(ciclo, intervaloMs);
}
