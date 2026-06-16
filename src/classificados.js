import { getDb } from './db.js';
import { normalizaTime } from './scoring.js';
import { bandeira } from './flags.js';

// Fases de classificacao. modo define como a fase e exibida:
//  '16avos'    -> selecoes com selo de origem (1A, 2B...), por grupo e posicao
//  'confrontos'-> confrontos mandante x visitante (o mando importa), em ordem
//  'campeao'   -> uma selecao por pessoa
export const FASES = [
  { key: '16avos', label: '16-avos', modo: '16avos', jogos: faixa(73, 88) },
  { key: 'oitavas', label: 'Oitavas', modo: 'confrontos', jogos: faixa(89, 96) },
  { key: 'quartas', label: 'Quartas', modo: 'confrontos', jogos: faixa(97, 100) },
  { key: 'semis', label: 'Semis', modo: 'confrontos', jogos: faixa(101, 102) },
  { key: 'final', label: 'Final', modo: 'confrontos', jogos: [104] },
  { key: 'campeao', label: 'Campeão', modo: 'campeao', jogos: [] },
];

function faixa(a, b) {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

// resolve um nome de selecao em { code?, label, src? } (sem bandeira se nao mapear)
function resolve(nome) {
  return bandeira(nome) || { label: nome };
}

// consenso: selecoes que aparecem em TODAS as listas (por nome normalizado)
function consensoDe(listasDeNomes) {
  if (listasDeNomes.length === 0) return [];
  const conjuntos = listasDeNomes.map((ns) => new Set(ns.filter(Boolean).map(normalizaTime)));
  const base = [...conjuntos[0]];
  const comuns = base.filter((chave) => conjuntos.every((s) => s.has(chave)));
  // recupera um nome legivel para cada chave comum a partir da 1a lista
  const nomePorChave = new Map();
  for (const nome of listasDeNomes[0]) {
    if (nome) nomePorChave.set(normalizaTime(nome), nome);
  }
  return comuns
    .map((c) => resolve(nomePorChave.get(c)))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

// popularidade: para cada selecao, quantas pessoas a tem nesta fase (conta 1x por
// pessoa), com % sobre o total. Ordena do mais escolhido para o menos.
export function popularidadeDe(listasDeNomes) {
  const total = listasDeNomes.length;
  const contagem = new Map(); // chave normalizada -> { nome, count }
  for (const lista of listasDeNomes) {
    const vistos = new Set();
    for (const nome of lista) {
      if (!nome) continue;
      const chave = normalizaTime(nome);
      if (vistos.has(chave)) continue; // 1x por pessoa
      vistos.add(chave);
      const atual = contagem.get(chave) || { nome, count: 0 };
      atual.count += 1;
      contagem.set(chave, atual);
    }
  }
  return [...contagem.values()]
    .map((v) => ({
      ...resolve(v.nome),
      count: v.count,
      pct: total ? Math.round((v.count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
}

export function classificadosDaFase(faseKey, db = getDb()) {
  const fase = FASES.find((f) => f.key === faseKey) || FASES[0];
  const jogadores = db.prepare('SELECT id, nome FROM jogadores ORDER BY nome').all();

  // -------- Campeão --------
  if (fase.modo === 'campeao') {
    const campeao = new Map();
    for (const e of db.prepare('SELECT jogador_id, campeao FROM palpites_especiais').all()) {
      campeao.set(e.jogador_id, e.campeao);
    }
    const linhas = jogadores.map((j) => ({
      nome: j.nome,
      times: campeao.get(j.id) ? [resolve(campeao.get(j.id))] : [],
    }));
    const listas = jogadores.map((j) => [campeao.get(j.id)]);
    const consenso = consensoDe(listas);
    const popularidade = popularidadeDe(listas);
    return { fase, fases: FASES, linhas, consenso, popularidade };
  }

  // palpites dos jogos desta fase, por jogador, em ordem de jogo
  const ph = fase.jogos.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT jogador_id, jogo_numero, time_casa, time_fora FROM palpites
       WHERE jogo_numero IN (${ph}) ORDER BY jogo_numero`,
    )
    .all(...fase.jogos);

  // -------- Mata-mata: confrontos (mando importa) --------
  if (fase.modo === 'confrontos') {
    const porJog = new Map(jogadores.map((j) => [j.id, []]));
    for (const r of rows) {
      if (porJog.has(r.jogador_id)) {
        porJog.get(r.jogador_id).push({ casa: resolve(r.time_casa), fora: resolve(r.time_fora) });
      }
    }
    const linhas = jogadores.map((j) => ({ nome: j.nome, confrontos: porJog.get(j.id) }));
    const listas = jogadores.map((j) =>
      porJog.get(j.id).flatMap((c) => [c.casa.label, c.fora.label]),
    );
    const consenso = consensoDe(listas);
    const popularidade = popularidadeDe(listas);
    return { fase, fases: FASES, linhas, consenso, popularidade };
  }

  // -------- 16-avos: selecoes com selo de origem (posicao + grupo) --------
  const origem = new Map(jogadores.map((j) => [j.id, new Map()]));
  for (const r of db.prepare('SELECT jogador_id, grupo, posicao, time FROM classificacao_grupos').all()) {
    if (origem.has(r.jogador_id) && r.time) {
      origem.get(r.jogador_id).set(normalizaTime(r.time), { grupo: r.grupo, pos: r.posicao });
    }
  }
  const porJog = new Map(jogadores.map((j) => [j.id, []]));
  for (const r of rows) {
    if (porJog.has(r.jogador_id)) porJog.get(r.jogador_id).push(r.time_casa, r.time_fora);
  }
  const linhas = jogadores.map((j) => {
    const ori = origem.get(j.id);
    const vistos = new Set();
    const times = [];
    for (const nome of porJog.get(j.id)) {
      if (!nome) continue;
      const chave = normalizaTime(nome);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const info = ori.get(chave);
      times.push({
        ...resolve(nome),
        grupo: info ? info.grupo : 'Z',
        pos: info ? info.pos : 9,
        badge: info ? `${info.pos}${info.grupo}` : '',
      });
    }
    // por grupo e por posicao: A1, A2, (A3), B1, B2...
    times.sort((a, b) => a.grupo.localeCompare(b.grupo) || a.pos - b.pos);
    return { nome: j.nome, times };
  });
  const listas = jogadores.map((j) => porJog.get(j.id));
  const consenso = consensoDe(listas);
  const popularidade = popularidadeDe(listas);
  return { fase, fases: FASES, linhas, consenso, popularidade };
}
