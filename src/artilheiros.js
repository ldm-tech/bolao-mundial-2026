import { getDb } from './db.js';
import { canoniza } from './jogadores-fut.js';
import { codigoDoNome, codigoDoIngles } from './flags.js';
import { leDetalhes } from './detalhevivo.js';

// FONTE UNICA: os artilheiros sao agregados dos MESMOS gols da ESPN que o
// /jogos usa (config aovivo_detalhe) — nome, contagem e gol-contra batem entre
// as duas telas. NAO usa mais a football-data /scorers.

function flagSrc(time) {
  const code = time && (codigoDoNome(time) || codigoDoIngles(time));
  return code ? `/flags/${code}.svg` : null;
}

// Soma os gols por jogador canonizado a partir dos eventos da ESPN ja gravados.
// Gol-contra (tipo OWN) NAO conta p/ artilheiro. chave canonica -> {nome, gols, time}.
function golsReais(db) {
  const det = leDetalhes(db);
  const jogos = new Map(
    db.prepare('SELECT numero, time_casa, time_fora FROM jogos').all().map((j) => [j.numero, j]),
  );
  const por = new Map();
  for (const [num, d] of Object.entries(det)) {
    const j = jogos.get(Number(num));
    if (!j) continue;
    const lados = [
      [d.golsCasa || [], j.time_casa],
      [d.golsFora || [], j.time_fora],
    ];
    for (const [gols, time] of lados) {
      for (const g of gols) {
        if (g.tipo === 'OWN') continue; // gol-contra nao credita artilheiro
        const c = canoniza(g.nome);
        const chave = c ? c.nome : g.nome;
        const ent = por.get(chave) || { nome: chave, gols: 0, time };
        ent.gols += 1;
        if (!ent.time) ent.time = time;
        por.set(chave, ent);
      }
    }
  }
  return por;
}

// Monta os dados da tela: goleadores reais (agregados da ESPN) + palpites cruzados.
export function montaArtilheiros(db = getDb()) {
  const golsPorCanonico = golsReais(db);
  const maxGols = [...golsPorCanonico.values()].reduce((m, s) => Math.max(m, s.gols), 0);

  // palpites de artilheiro -> canonico -> { nome, time, apostadores: [] }
  const palpites = db
    .prepare(
      "SELECT pe.artilheiro AS palpite, COALESCE(NULLIF(j.nome_exibicao, ''), j.nome) AS nome " +
        'FROM palpites_especiais pe JOIN jogadores j ON j.id = pe.jogador_id ' +
        "WHERE pe.artilheiro IS NOT NULL AND pe.artilheiro <> ''",
    )
    .all();

  const porCanonico = new Map();
  for (const r of palpites) {
    const c = canoniza(r.palpite);
    if (!c) continue;
    if (!porCanonico.has(c.nome)) porCanonico.set(c.nome, { nome: c.nome, time: c.time, apostadores: [] });
    porCanonico.get(c.nome).apostadores.push(r.nome);
  }

  // ranking dos goleadores reais (com bandeira e nº de apostas no bolao)
  const ranking = [...golsPorCanonico.values()]
    .map((s) => ({
      nome: s.nome,
      gols: s.gols,
      time: s.time,
      flag: flagSrc(s.time),
      nApostas: ((porCanonico.get(s.nome) || {}).apostadores || []).length,
    }))
    .sort((a, b) => b.gols - a.gols || a.nome.localeCompare(b.nome, 'pt-BR'));

  // linhas do bolao: cada jogador apostado + gols atuais + apostadores
  const linhasBolao = [...porCanonico.values()]
    .map((p) => {
      const g = golsPorCanonico.get(p.nome);
      return {
        nome: p.nome,
        gols: g ? g.gols : 0,
        nApostas: p.apostadores.length,
        apostadores: p.apostadores.sort((a, b) => a.localeCompare(b, 'pt-BR')),
        flag: flagSrc((g && g.time) || p.time),
        lider: !!(g && maxGols > 0 && g.gols === maxGols),
      };
    })
    .sort((a, b) => b.gols - a.gols || b.nApostas - a.nApostas || a.nome.localeCompare(b.nome, 'pt-BR'));

  const lideres = ranking.filter((s) => maxGols > 0 && s.gols === maxGols);
  const acertando = [];
  if (maxGols > 0) {
    for (const l of linhasBolao) if (l.lider) acertando.push(...l.apostadores);
  }

  return {
    ranking,
    maxGols,
    lideres,
    linhasBolao,
    acertando: [...new Set(acertando)].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    totalPalpites: palpites.length,
  };
}
