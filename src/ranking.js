import { getDb } from './db.js';
import { pontosPlacar, bonusMataMata, pontosEspeciais } from './scoring.js';

const FASE_LABEL = {
  grupos: 'Fase de Grupos',
  '1/16': '16-avos de Final',
  oitavas: 'Oitavas de Final',
  quartas: 'Quartas de Final',
  semis: 'Semifinais',
  terceiro: 'Disputa de 3º Lugar',
  final: 'Final',
};
export const FASES_ORDEM = ['grupos', '1/16', 'oitavas', 'quartas', 'semis', 'terceiro', 'final'];

// Resultado EFETIVO por jogo: o manual (resultados) sobrepoe o ao vivo
// (resultados_ao_vivo). Os times/penaltis vem sempre do manual; os gols vem do
// manual se houver, senao do ao vivo. fonte = manual | ao_vivo | nenhum.
export function resultadosEfetivos(db = getDb()) {
  const manual = new Map(
    db.prepare('SELECT * FROM resultados').all().map((r) => [r.jogo_numero, r]),
  );
  const vivo = new Map(
    db.prepare('SELECT * FROM resultados_ao_vivo').all().map((r) => [r.jogo_numero, r]),
  );
  const porJogo = new Map();
  for (const num of new Set([...manual.keys(), ...vivo.keys()])) {
    const m = manual.get(num);
    const v = vivo.get(num);
    const manualGols = m && m.gols_casa != null && m.gols_fora != null;
    const vivoGols = v && v.gols_casa != null && v.gols_fora != null;
    let gols_casa = null;
    let gols_fora = null;
    let fonte = 'nenhum';
    let status = null;
    if (manualGols) {
      gols_casa = m.gols_casa;
      gols_fora = m.gols_fora;
      fonte = 'manual';
    } else if (vivoGols) {
      gols_casa = v.gols_casa;
      gols_fora = v.gols_fora;
      fonte = 'ao_vivo';
      status = v.status;
    }
    porJogo.set(num, {
      jogo_numero: num,
      gols_casa,
      gols_fora,
      time_casa: m ? m.time_casa : null,
      time_fora: m ? m.time_fora : null,
      penaltis_casa: m ? m.penaltis_casa : null,
      penaltis_fora: m ? m.penaltis_fora : null,
      fonte,
      status,
    });
  }
  return porJogo;
}

// Instante do inicio do jogo (data YYYY-MM-DD + hora HH:MM em BRT) em ms UTC.
function inicioUTC(data, hora) {
  if (!data || !hora) return null;
  const [y, m, d] = data.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  if ([y, m, d, hh, mm].some((v) => Number.isNaN(v))) return null;
  return Date.UTC(y, m - 1, d, hh + 3, mm); // BRT (UTC-3) -> UTC
}

// Estado de exibicao do placar de um jogo: 'ao_vivo' | 'parcial' | null.
// Prioridade: (1) status da API (fato); (2) relogio — se ja comecou e ainda
// esta na janela, e ao vivo PARA QUALQUER FONTE (manual inclusive); (3) fora da
// janela, placar da API vira 'parcial' (aguarda o oficial) e o manual vira
// definitivo (null, sem selo).
const JANELA_JOGO_MS = 150 * 60 * 1000; // ~2h30
export function estadoDoPlacar(fonte, status, data, hora, agoraMs = Date.now()) {
  if (fonte === 'nenhum') return null; // sem placar
  if (status === 'IN_PLAY' || status === 'PAUSED') return 'ao_vivo'; // API: ao vivo
  if (status === 'FINISHED') return 'parcial'; // API encerrou, aguarda o oficial
  const inicio = inicioUTC(data, hora);
  const naJanela = inicio != null && agoraMs >= inicio && agoraMs <= inicio + JANELA_JOGO_MS;
  if (naJanela) return 'ao_vivo'; // relogio vale tambem p/ placar manual
  return fonte === 'ao_vivo' ? 'parcial' : null; // manual fora da janela = definitivo
}

// Estado ao vivo: assinatura (para o auto-refresh) + contagens (para o banner).
// Calculado num passe so sobre os resultados efetivos.
export function estadoAoVivo(db = getDb()) {
  const efetivos = resultadosEfetivos(db);
  const jogos = new Map(db.prepare('SELECT numero, data, hora FROM jogos').all().map((j) => [j.numero, j]));
  const partes = [];
  let aoVivoCount = 0;
  let parcialCount = 0;
  for (const n of [...efetivos.keys()].sort((a, b) => a - b)) {
    const r = efetivos.get(n);
    if (r.fonte === 'nenhum') continue;
    const j = jogos.get(n) || {};
    const est = estadoDoPlacar(r.fonte, r.status, j.data, j.hora);
    // estado entra na assinatura: a transicao da janela (abre/fecha) muda a
    // versao e dispara o auto-refresh mesmo sem o placar mudar.
    partes.push(`${n}:${r.gols_casa}/${r.gols_fora}/${r.fonte}/${r.status || ''}/${est || ''}`);
    if (est === 'ao_vivo') aoVivoCount += 1;
    else if (est === 'parcial') parcialCount += 1;
  }
  // assinatura dos detalhes da ESPN (autores/intervalo, sem o minuto que muda
  // toda hora) entra na versao: a tela ressincroniza quando entra um gol ou
  // vira o intervalo, mesmo sem mudanca de placar.
  let detSig = '';
  try {
    const row = db.prepare("SELECT valor FROM config WHERE chave = 'aovivo_sig'").get();
    detSig = (row && row.valor) || '';
  } catch (e) {
    detSig = '';
  }
  return {
    versao: partes.join('|') + (detSig ? '#' + detSig : ''),
    totalResultados: partes.length,
    aoVivoCount,
    parcialCount,
  };
}

// Primeiro jogo AO VIVO agora (menor numero). Usado pra abrir o site direto no
// jogo em andamento. Retorna { numero, fase } ou null se nada estiver ao vivo.
export function primeiroJogoAoVivo(db = getDb()) {
  const efetivos = resultadosEfetivos(db);
  const jogos = new Map(
    db.prepare('SELECT numero, fase, data, hora FROM jogos').all().map((j) => [j.numero, j]),
  );
  let achado = null;
  for (const [numero, r] of efetivos) {
    if (r.fonte === 'nenhum') continue;
    const j = jogos.get(numero);
    if (!j) continue;
    if (estadoDoPlacar(r.fonte, r.status, j.data, j.hora) === 'ao_vivo') {
      if (achado == null || numero < achado.numero) achado = { numero, fase: j.fase };
    }
  }
  return achado;
}

// Evolucao da POSICAO no ranking (jogo a jogo) dos jogadores `ids`. A cada jogo
// JA computado, ranqueia TODOS os participantes pela pontuacao acumulada (placar
// + bonus de mata-mata; especiais ficam de fora, como na contagem por-jogo) e
// registra a posicao de cada `id`. Tambem devolve `acum` (pontos) p/ o tooltip.
// Retorna { jogos:[{numero,casa,fora}], series:[{id,nome,acum,pos}], total }.
export function evolucaoFixados(db = getDb(), ids = []) {
  if (!ids || !ids.length) return { jogos: [], series: [], total: 0 };
  const efetivos = resultadosEfetivos(db);
  const jogosTab = new Map(
    db.prepare('SELECT numero, fase, time_casa, time_fora FROM jogos').all().map((j) => [j.numero, j]),
  );
  const computados = [...efetivos.entries()]
    .filter(([, r]) => r.gols_casa != null && r.gols_fora != null)
    .map(([n]) => n)
    .sort((a, b) => a - b);
  const jogos = computados.map((n) => {
    const j = jogosTab.get(n) || {};
    return { numero: n, casa: j.time_casa || null, fora: j.time_fora || null };
  });

  // a posicao de um fixado depende de TODOS — carrega todos os jogadores+palpites.
  // nome_exibicao existe no Pedreira, nao na familia — detecta a coluna.
  const temExib = db.prepare('PRAGMA table_info(jogadores)').all().some((c) => c.name === 'nome_exibicao');
  const colNome = temExib ? "COALESCE(NULLIF(nome_exibicao, ''), nome)" : 'nome';
  const todos = db.prepare(`SELECT id, ${colNome} AS nome FROM jogadores`).all();
  const palpPorJog = new Map(todos.map((j) => [j.id, new Map()]));
  for (const p of db.prepare('SELECT * FROM palpites').all()) {
    const m = palpPorJog.get(p.jogador_id);
    if (m) m.set(p.jogo_numero, p);
  }
  const acc = new Map(todos.map((j) => [j.id, 0]));
  const accSerie = new Map(ids.map((id) => [id, []]));
  const posSerie = new Map(ids.map((id) => [id, []]));

  for (const n of computados) {
    const real = efetivos.get(n);
    const j = jogosTab.get(n);
    for (const jog of todos) {
      const p = palpPorJog.get(jog.id).get(n);
      acc.set(jog.id, acc.get(jog.id) + pontosPlacar(p, real) + (j ? bonusMataMata(j.fase, p, real).total : 0));
    }
    const ord = todos.map((jog) => ({ id: jog.id, a: acc.get(jog.id) })).sort((x, y) => y.a - x.a);
    const posMap = new Map();
    let pos = 0;
    let prev = null;
    ord.forEach((o, idx) => {
      if (o.a !== prev) { pos = idx + 1; prev = o.a; }
      posMap.set(o.id, pos);
    });
    for (const id of ids) {
      if (!acc.has(id)) continue;
      accSerie.get(id).push(acc.get(id));
      posSerie.get(id).push(posMap.get(id));
    }
  }

  const nomePorId = new Map(todos.map((j) => [j.id, j.nome]));
  const series = ids
    .filter((id) => nomePorId.has(id))
    .map((id) => ({ id, nome: nomePorId.get(id), acum: accSerie.get(id), pos: posSerie.get(id) }));
  return { jogos, series, total: todos.length };
}

// Le os resultados efetivos + os especiais reais.
function carregaResultados(db) {
  const porJogo = resultadosEfetivos(db);
  const esp = db.prepare('SELECT * FROM resultados_especiais WHERE id = 1').get() || {};
  const final = porJogo.get(104);
  const especiaisReais = {
    artilheiro: esp.artilheiro ?? null,
    campeao: esp.campeao ?? null,
    finalistas: final ? [final.time_casa, final.time_fora].filter(Boolean) : [],
  };
  return { porJogo, especiaisReais };
}

// Calcula o detalhe completo de um jogador.
export function detalheJogador(jogadorId, db = getDb()) {
  const jogador = db.prepare('SELECT * FROM jogadores WHERE id = ?').get(jogadorId);
  if (!jogador) return null;

  const jogos = db.prepare('SELECT * FROM jogos ORDER BY numero').all();
  const palpites = new Map();
  for (const p of db.prepare('SELECT * FROM palpites WHERE jogador_id = ?').all(jogadorId)) {
    palpites.set(p.jogo_numero, p);
  }
  const palpiteEsp =
    db.prepare('SELECT * FROM palpites_especiais WHERE jogador_id = ?').get(jogadorId) || {};
  const { porJogo, especiaisReais } = carregaResultados(db);

  const linhas = [];
  const porFase = {};
  for (const f of FASES_ORDEM) porFase[f] = 0;
  let totalPlacar = 0;
  let totalBonus = 0;

  for (const jogo of jogos) {
    const palpite = palpites.get(jogo.numero);
    const real = porJogo.get(jogo.numero);
    const temResultado = real && real.gols_casa != null && real.gols_fora != null;

    const pPlacar = temResultado ? pontosPlacar(palpite, real) : 0;
    const bonus = real
      ? bonusMataMata(jogo.fase, palpite, real)
      : { confronto: 0, selecao: 0, total: 0 };

    totalPlacar += pPlacar;
    totalBonus += bonus.total;
    porFase[jogo.fase] += pPlacar + bonus.total;

    linhas.push({
      numero: jogo.numero,
      fase: jogo.fase,
      faseLabel: FASE_LABEL[jogo.fase],
      data: jogo.data,
      // mata-mata: mostra os times do palpite; grupos: times oficiais
      timeCasa: jogo.fase === 'grupos' ? jogo.time_casa : palpite?.time_casa,
      timeFora: jogo.fase === 'grupos' ? jogo.time_fora : palpite?.time_fora,
      palpite: palpite ? `${palpite.gols_casa ?? '-'} x ${palpite.gols_fora ?? '-'}` : '-',
      palpitePen:
        palpite && palpite.penaltis_casa != null && palpite.penaltis_fora != null
          ? `${palpite.penaltis_casa} x ${palpite.penaltis_fora}`
          : null,
      real: temResultado ? `${real.gols_casa} x ${real.gols_fora}` : null,
      realPen:
        real && real.penaltis_casa != null && real.penaltis_fora != null
          ? `${real.penaltis_casa} x ${real.penaltis_fora}`
          : null,
      realTimeCasa: real?.time_casa,
      realTimeFora: real?.time_fora,
      estadoVivo: temResultado ? estadoDoPlacar(real.fonte, real.status, jogo.data, jogo.hora) : null,
      pontosPlacar: pPlacar,
      pontosBonus: bonus.total,
      pontos: pPlacar + bonus.total,
    });
  }

  const especiais = pontosEspeciais(palpiteEsp, especiaisReais);
  const total = totalPlacar + totalBonus + especiais.total;
  const totalGrupos = jogos
    .filter((j) => j.fase === 'grupos')
    .reduce((s, j) => {
      const r = porJogo.get(j.numero);
      return r && r.gols_casa != null ? s + pontosPlacar(palpites.get(j.numero), r) : s;
    }, 0);

  return {
    jogador,
    palpiteEsp,
    especiais,
    porFase,
    totalPlacar,
    totalBonus,
    totalGrupos,
    total,
    linhas,
  };
}

// Ranking geral (todos os jogadores) com criterio de desempate estavel.
export function rankingGeral(db = getDb()) {
  const jogadores = db.prepare('SELECT * FROM jogadores ORDER BY nome').all();
  const linhas = jogadores.map((j) => {
    const d = detalheJogador(j.id, db);
    return {
      id: j.id,
      nome: j.nome,
      total: d.total,
      totalGrupos: d.totalGrupos,
      especiais: d.especiais.total,
      bonus: d.totalBonus,
    };
  });
  linhas.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
  let posicao = 0;
  let anterior = null;
  linhas.forEach((l, i) => {
    if (l.total !== anterior) {
      posicao = i + 1;
      anterior = l.total;
    }
    l.posicao = posicao; // empates compartilham posicao
  });
  return linhas;
}

// Calcula geral + faseGrupos num unico passe (le tudo uma vez). Escala p/ 102.
let _cacheRank = { sig: null, valor: null };
export function rankingCompleto(db = getDb()) {
  const est = estadoAoVivo(db); // assinatura dos placares (manual + ao vivo)
  const esp = db.prepare('SELECT artilheiro, campeao FROM resultados_especiais WHERE id=1').get() || {};
  const nJog = db.prepare('SELECT COUNT(*) c FROM jogadores').get().c;
  const sig = `${est.versao}|esp:${esp.artilheiro || ''}/${esp.campeao || ''}|n:${nJog}`;
  if (_cacheRank.sig === sig) return _cacheRank.valor;

  const jogadores = db.prepare(
    'SELECT id, COALESCE(NULLIF(nome_exibicao, \'\'), nome) AS nome FROM jogadores',
  ).all();
  const jogos = db.prepare('SELECT * FROM jogos ORDER BY numero').all();
  const { porJogo, especiaisReais } = carregaResultados(db);
  const palpitesPorJog = new Map();
  for (const p of db.prepare('SELECT * FROM palpites').all()) {
    if (!palpitesPorJog.has(p.jogador_id)) palpitesPorJog.set(p.jogador_id, new Map());
    palpitesPorJog.get(p.jogador_id).set(p.jogo_numero, p);
  }
  const espPorJog = new Map(
    db.prepare('SELECT * FROM palpites_especiais').all().map((e) => [e.jogador_id, e]),
  );

  const linhas = jogadores.map((j) => {
    const palp = palpitesPorJog.get(j.id) || new Map();
    let total = 0;
    let bonus = 0;
    let totalGrupos = 0;
    for (const jogo of jogos) {
      const real = porJogo.get(jogo.numero);
      const temResultado = real && real.gols_casa != null && real.gols_fora != null;
      const palpite = palp.get(jogo.numero);
      const pPlacar = temResultado ? pontosPlacar(palpite, real) : 0;
      const b = real ? bonusMataMata(jogo.fase, palpite, real).total : 0;
      total += pPlacar + b;
      bonus += b;
      if (jogo.fase === 'grupos') totalGrupos += pPlacar;
    }
    const e = pontosEspeciais(espPorJog.get(j.id) || {}, especiaisReais);
    total += e.total;
    return { id: j.id, nome: j.nome, total, totalGrupos, especiais: e.total, bonus };
  });

  const ordena = (campo) => {
    const arr = linhas.map((l) => ({ ...l, total: l[campo] }));
    arr.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
    let posicao = 0;
    let anterior = null;
    arr.forEach((l, i) => {
      if (l.total !== anterior) { posicao = i + 1; anterior = l.total; }
      l.posicao = posicao;
    });
    return arr;
  };

  const geral = ordena('total');
  const faseGrupos = ordena('totalGrupos').map((l) => ({ id: l.id, nome: l.nome, total: l.total, posicao: l.posicao }));
  const valor = { geral, faseGrupos };
  _cacheRank = { sig, valor };
  return valor;
}

// Ranking apenas da 1a fase (pontos dos jogos de grupos) — premio do lider da fase.
export function rankingFaseGrupos(db = getDb()) {
  const jogadores = db.prepare('SELECT * FROM jogadores ORDER BY nome').all();
  const linhas = jogadores.map((j) => {
    const d = detalheJogador(j.id, db);
    return { id: j.id, nome: j.nome, total: d.totalGrupos };
  });
  linhas.sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
  let posicao = 0;
  let anterior = null;
  linhas.forEach((l, i) => {
    if (l.total !== anterior) {
      posicao = i + 1;
      anterior = l.total;
    }
    l.posicao = posicao;
  });
  return linhas;
}

export { FASE_LABEL };
