import express from 'express';
import session from 'express-session';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { getDb, getConfig } from './db.js';
import { verificaSenha } from './auth.js';
import {
  rankingGeral,
  rankingFaseGrupos,
  rankingCompleto,
  detalheJogador,
  resultadosEfetivos,
  estadoAoVivo,
  estadoDoPlacar,
  primeiroJogoAoVivo,
  evolucaoFixados,
  FASE_LABEL,
  FASES_ORDEM,
} from './ranking.js';
import { pontosPlacar, bonusMataMata } from './scoring.js';
import { oddsBolao, iniciaAgendadorOdds } from './odds.js';
import { classificadosDaFase, FASES as FASES_CLASSIF } from './classificados.js';
import { montaSecador } from './secador.js';
import { bandeira } from './flags.js';
import { carregaConfig as carregaCfgPremiacao, calculaPremios } from './premiacao.js';
import { montaArtilheiros } from './artilheiros.js';
import { leDetalhes, iniciaAgendadorDetalheVivo } from './detalhevivo.js';
import { feedbackHabilitado, linearConfigurado, criaIssueLinear, rateLimitOk } from './feedback.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const db = getDb();

const CFG_PREMIACAO = carregaCfgPremiacao();

function nPagantes(db) {
  return db.prepare('SELECT COUNT(*) c FROM jogadores WHERE pago = 1').get().c;
}
// Sem cifras: usado nas telas abertas (remove valorReais e pool).
function construirPremios(db, geral, faseGrupos) {
  const { premios, pool } = calculaPremios({
    cfg: CFG_PREMIACAO, geral, faseGrupos, nPagantes: nPagantes(db),
  });
  const publicos = premios.map(({ valorReais, ...p }) => p); // remove R$
  return { premios: publicos, pool };
}

const NOME_BOLAO = process.env.NOME_BOLAO || 'Bolão Pedreira & Amigos 2026';

const emProducao = process.env.NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));
if (emProducao) app.set('trust proxy', 1); // atras do nginx
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // form de feedback envia JSON
app.use(express.static(join(__dirname, '..', 'public')));

// Healthcheck leve p/ deploy zero-downtime (sem sessao, sem query de estado):
// Swarm/Traefik so promovem o container novo quando isto responde 200.
app.get('/healthz', (req, res) => res.type('text').send('ok'));

app.use(
  session({
    secret: process.env.BOLAO_SESSION_SECRET || randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: emProducao, // exige HTTPS em producao
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

// variaveis disponiveis em todas as views
app.use((req, res, next) => {
  res.locals.NOME_BOLAO = NOME_BOLAO;
  res.locals.isAdmin = !!req.session.admin;
  res.locals.path = req.path;
  // botao de feedback->Linear: so no dominio de testes (ldm.com.br) e com Linear configurado
  res.locals.feedbackOn = feedbackHabilitado(req.hostname) && linearConfigurado(process.env);
  // helper de bandeira para as views: devolve <img> ou '' se nao mapear
  res.locals.flag = (nome) => {
    const b = bandeira(nome);
    return b ? `<img class="flag" src="${b.src}" alt="" loading="lazy">` : '';
  };
  // estado ao vivo (assinatura p/ auto-refresh + contagens p/ o banner)
  const est = estadoAoVivo(db);
  res.locals.versao = est.versao;
  res.locals.aoVivoCount = est.aoVivoCount;
  res.locals.parcialCount = est.parcialCount;
  res.locals.totalResultados = est.totalResultados;
  next();
});

function exigeAdmin(req, res, next) {
  if (req.session.admin) return next();
  return res.redirect('/admin');
}

// ---- lista canonica de selecoes (para os datalists do admin) ----
function selecoesCanonicas() {
  const rows = db
    .prepare(
      "SELECT time_casa AS t FROM jogos WHERE fase='grupos' " +
        "UNION SELECT time_fora FROM jogos WHERE fase='grupos' ORDER BY t",
    )
    .all();
  return rows.map((r) => r.t).filter(Boolean);
}

// ============================ PAGINAS PUBLICAS ============================

function renderRanking(req, res) {
  const { geral, faseGrupos } = rankingCompleto(db);
  const { premios } = construirPremios(db, geral, faseGrupos);
  res.render('ranking', { ranking: geral, premios });
}

app.get('/', (req, res) => {
  // Se tem jogo rolando, essa e a info mais importante: abre direto nele.
  const vivo = primeiroJogoAoVivo(db);
  if (vivo) return res.redirect(`/jogos?fase=${encodeURIComponent(vivo.fase)}#jogo-${vivo.numero}`);
  renderRanking(req, res);
});

// Ranking sempre acessivel, sem o desvio do '/' (evita loop ao clicar "Ranking"
// no menu enquanto tem jogo ao vivo).
app.get('/ranking', renderRanking);

app.get('/artilheiros', (req, res) => {
  res.render('artilheiros', montaArtilheiros(db));
});

// Serie acumulada (jogo a jogo) dos jogadores fixados — alimenta o grafico do ranking.
app.get('/api/evolucao', (req, res) => {
  let ids;
  if (req.query.todos) {
    ids = db.prepare('SELECT id FROM jogadores ORDER BY nome').all().map((r) => r.id);
  } else {
    ids = String(req.query.ids || '')
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter(Number.isInteger)
      .slice(0, 8);
  }
  res.json(evolucaoFixados(db, ids));
});

app.get('/fase-grupos', (req, res) => {
  const ranking = rankingCompleto(db).faseGrupos;
  res.render('fase-grupos', { ranking });
});

app.get('/premiacao', (req, res) => {
  const { geral, faseGrupos } = rankingCompleto(db);
  const { premios } = construirPremios(db, geral, faseGrupos);
  res.render('premiacao', { premios });
});

app.get('/regulamento', (req, res) => {
  const totalJogadores = db.prepare('SELECT COUNT(*) c FROM jogadores').get().c;
  res.render('regulamento', { totalJogadores });
});

app.get('/odds', (req, res) => {
  const faseFiltro = req.query.fase && FASE_LABEL[req.query.fase] ? req.query.fase : 'grupos';
  const jogos = db.prepare('SELECT * FROM jogos WHERE fase = ? ORDER BY numero').all(faseFiltro);
  const bolao = oddsBolao(db);
  const mercado = new Map(
    db.prepare('SELECT * FROM odds_mercado').all().map((r) => [r.jogo_numero, r]),
  );
  const efetivos = resultadosEfetivos(db);
  // 3 percentuais inteiros que somam EXATAMENTE 100 (metodo do maior resto)
  const pct100 = (a, b, c) => {
    const total = a + b + c;
    if (!total) return null;
    const raw = [a, b, c].map((v) => (v / total) * 100);
    const piso = raw.map(Math.floor);
    const ordem = raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((x, y) => y.f - x.f);
    const res = piso.slice();
    let resto = 100 - piso.reduce((s, v) => s + v, 0);
    for (let k = 0; k < resto; k += 1) res[ordem[k].i] += 1;
    return { casa: res[0], empate: res[1], fora: res[2] };
  };
  const lista = jogos.map((jogo) => {
    const r = efetivos.get(jogo.numero);
    const tCasa = jogo.fase === 'grupos' ? jogo.time_casa : r?.time_casa;
    const tFora = jogo.fase === 'grupos' ? jogo.time_fora : r?.time_fora;
    // so faz sentido com o confronto definido (grupos sempre; mata-mata so apos
    // os times reais; "a definir" nao tem odds de grupo)
    const temConfronto = !!(tCasa && tFora);
    const b = bolao.get(jogo.numero);
    const grupo = temConfronto && b ? pct100(b.casa, b.empate, b.fora) : null;
    const mk = mercado.get(jogo.numero);
    const merc = temConfronto && mk && mk.prob_casa != null
      ? pct100(mk.prob_casa, mk.prob_empate, mk.prob_fora)
      : null;
    // favorito = resultado mais provavel (casa/empate/fora). A tag aparece
    // quando grupo e mercado discordam do resultado mais provavel — inclusive
    // empate (grupo) x vitoria (mercado), que e uma discordancia legitima.
    const favorito = (o) => {
      const m = Math.max(o.casa, o.empate, o.fora);
      if (o.casa === m) return 'casa';
      if (o.fora === m) return 'fora';
      return 'empate';
    };
    const contraMercado = !!(grupo && merc && favorito(grupo) !== favorito(merc));
    return { jogo, tCasa, tFora, grupo, merc, contraMercado };
  });
  res.render('odds', {
    lista,
    faseFiltro,
    FASE_LABEL,
    FASES_ORDEM,
    temMercado: mercado.size > 0,
  });
});

app.get('/classificados', (req, res) => {
  const faseKey =
    req.query.fase && FASES_CLASSIF.some((f) => f.key === req.query.fase)
      ? req.query.fase
      : '16avos';
  res.render('classificados', classificadosDaFase(faseKey, db));
});

app.get('/jogador/:id', (req, res) => {
  const detalhe = detalheJogador(Number(req.params.id), db);
  if (!detalhe) return res.status(404).render('404');
  const porFaseLista = FASES_ORDEM.map((f) => ({
    fase: f,
    label: FASE_LABEL[f],
    pontos: detalhe.porFase[f] || 0,
  }));
  res.render('jogador', { detalhe, porFaseLista });
});

app.get('/jogos', (req, res) => {
  const faseFiltro = req.query.fase && FASE_LABEL[req.query.fase] ? req.query.fase : 'grupos';
  const jogos = db.prepare('SELECT * FROM jogos WHERE fase = ? ORDER BY numero').all(faseFiltro);
  const resultados = resultadosEfetivos(db); // manual + ao vivo
  const jogadores = db
    .prepare("SELECT id, COALESCE(NULLIF(nome_exibicao, ''), nome) AS nome FROM jogadores ORDER BY nome")
    .all();
  const nomePorId = new Map(jogadores.map((j) => [j.id, j.nome]));
  const detalhes = leDetalhes(db); // minuto + autores dos gols (jogos ao vivo)
  const palpitesPorJogo = new Map();
  for (const p of db.prepare('SELECT * FROM palpites').all()) {
    if (!palpitesPorJogo.has(p.jogo_numero)) palpitesPorJogo.set(p.jogo_numero, []);
    palpitesPorJogo.get(p.jogo_numero).push(p);
  }

  // monta a visao por jogo ja com os pontos de cada palpite
  const lista = jogos.map((jogo) => {
    const real = resultados.get(jogo.numero);
    const temResultado = real && real.gols_casa != null && real.gols_fora != null;
    // Times: nos grupos vêm do fixture; no mata-mata vêm da chave lançada no
    // admin (resultados.time_casa/fora) — aparecem mesmo SEM placar ainda.
    const timeCasa = jogo.fase === 'grupos' ? jogo.time_casa : real ? real.time_casa : null;
    const timeFora = jogo.fase === 'grupos' ? jogo.time_fora : real ? real.time_fora : null;
    const palpites = (palpitesPorJogo.get(jogo.numero) || [])
      .map((p) => {
        const placar = temResultado ? pontosPlacar(p, real) : 0;
        const bonus = real ? bonusMataMata(jogo.fase, p, real).total : 0;
        return {
          nome: nomePorId.get(p.jogador_id) || '?',
          timeCasa: jogo.fase === 'grupos' ? jogo.time_casa : p.time_casa,
          timeFora: jogo.fase === 'grupos' ? jogo.time_fora : p.time_fora,
          gols: `${p.gols_casa ?? '-'} x ${p.gols_fora ?? '-'}`,
          pen:
            p.penaltis_casa != null && p.penaltis_fora != null
              ? `${p.penaltis_casa} x ${p.penaltis_fora}`
              : null,
          pontos: placar + bonus,
          placar,
        };
      })
      .sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome, 'pt-BR'));
    const estadoVivo = temResultado
      ? estadoDoPlacar(real.fonte, real.status, jogo.data, jogo.hora)
      : null;
    // "Quem secar": so no jogo AO VIVO — quem ainda pode cravar o placar exato
    const secador = estadoVivo === 'ao_vivo'
      ? montaSecador(
          (palpitesPorJogo.get(jogo.numero) || []).map((p) => ({
            nome: nomePorId.get(p.jogador_id) || '?',
            gols_casa: p.gols_casa,
            gols_fora: p.gols_fora,
          })),
          real.gols_casa,
          real.gols_fora,
        )
      : null;
    return {
      jogo,
      real: temResultado ? real : null,
      timeCasa,
      timeFora,
      estadoVivo,
      secador,
      detalhe: temResultado || estadoVivo === 'ao_vivo' ? detalhes[jogo.numero] || null : null,
      palpites,
    };
  });

  res.render('jogos', { lista, faseFiltro, FASE_LABEL, FASES_ORDEM });
});

// ============================ FEEDBACK -> LINEAR ============================

app.post('/feedback', async (req, res) => {
  // gate de dominio (defesa em profundidade) + Linear configurado
  if (!feedbackHabilitado(req.hostname) || !linearConfigurado(process.env)) {
    return res.status(404).json({ ok: false, erro: 'desabilitado' });
  }
  const { tipo, mensagem, nome, empresa, url } = req.body || {};
  if (empresa) return res.json({ ok: true }); // honeypot: finge sucesso e descarta
  const msg = String(mensagem || '').trim();
  if (msg.length < 3 || msg.length > 4000) {
    return res.status(400).json({ ok: false, erro: 'Mensagem muito curta ou muito longa.' });
  }
  if (!rateLimitOk(req.ip)) {
    return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Tente de novo em 1 minuto.' });
  }
  try {
    const r = await criaIssueLinear({
      tipo: tipo === 'Bug' ? 'Bug' : 'Sugestão',
      mensagem: msg,
      nome: String(nome || '').trim().slice(0, 120),
      url: String(url || req.get('referer') || '').slice(0, 300),
      ua: String(req.get('user-agent') || '').slice(0, 300),
      origem: process.env.FEEDBACK_ORIGEM || NOME_BOLAO,
    });
    res.json({ ok: true, url: r.url });
  } catch (e) {
    console.error('Feedback/Linear falhou:', e.message);
    res.status(502).json({ ok: false, erro: 'Não consegui enviar agora. Tente mais tarde.' });
  }
});

// ============================ ADMIN ============================

app.get('/admin', (req, res) => {
  if (!req.session.admin) return res.render('admin-login', { erro: null });
  const jogos = db.prepare('SELECT * FROM jogos ORDER BY numero').all();
  const resultados = new Map(
    db.prepare('SELECT * FROM resultados').all().map((r) => [r.jogo_numero, r]),
  );
  const espReais = db.prepare('SELECT * FROM resultados_especiais WHERE id=1').get() || {};
  const faseAtual = req.query.fase && FASE_LABEL[req.query.fase] ? req.query.fase : 'grupos';
  res.render('admin', {
    jogos: jogos.filter((j) => j.fase === faseAtual),
    resultados,
    espReais,
    faseAtual,
    FASE_LABEL,
    FASES_ORDEM,
    selecoes: selecoesCanonicas(),
    salvou: req.query.salvou === '1',
  });
});

app.post('/admin/login', (req, res) => {
  const hash = getConfig('senha_admin_hash');
  if (verificaSenha(req.body.senha || '', hash)) {
    req.session.admin = true;
    return res.redirect('/admin');
  }
  res.render('admin-login', { erro: 'Senha incorreta.' });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// numero ou null a partir de string de formulario
function numOuNull(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
function txtOuNull(v) {
  const s = (v ?? '').toString().trim();
  return s === '' ? null : s;
}

const upsertResultado = db.prepare(`
  INSERT INTO resultados
    (jogo_numero, gols_casa, gols_fora, time_casa, time_fora, penaltis_casa, penaltis_fora, atualizado_em)
  VALUES
    (@jogo_numero, @gols_casa, @gols_fora, @time_casa, @time_fora, @penaltis_casa, @penaltis_fora, @atualizado_em)
  ON CONFLICT(jogo_numero) DO UPDATE SET
    gols_casa=excluded.gols_casa, gols_fora=excluded.gols_fora,
    time_casa=excluded.time_casa, time_fora=excluded.time_fora,
    penaltis_casa=excluded.penaltis_casa, penaltis_fora=excluded.penaltis_fora,
    atualizado_em=excluded.atualizado_em`);
const apagaResultado = db.prepare('DELETE FROM resultados WHERE jogo_numero = ?');

app.post('/admin/resultados', exigeAdmin, (req, res) => {
  const fase = FASE_LABEL[req.body.fase] ? req.body.fase : 'grupos';
  const jogos = db.prepare('SELECT * FROM jogos WHERE fase = ?').all(fase);
  const agora = new Date().toISOString();
  const tx = db.transaction(() => {
    for (const jogo of jogos) {
      const n = jogo.numero;
      const gc = numOuNull(req.body[`gc_${n}`]);
      const gf = numOuNull(req.body[`gf_${n}`]);
      // grupos: times oficiais; mata-mata: times reais informados pelo admin
      const ehGrupos = fase === 'grupos';
      const tc = ehGrupos ? jogo.time_casa : txtOuNull(req.body[`tc_${n}`]);
      const tf = ehGrupos ? jogo.time_fora : txtOuNull(req.body[`tf_${n}`]);
      // penaltis so existem do mata-mata em diante (e nao contam pontos)
      const penc = ehGrupos ? null : numOuNull(req.body[`penc_${n}`]);
      const penf = ehGrupos ? null : numOuNull(req.body[`penf_${n}`]);
      const temPlacar = gc !== null && gf !== null;
      const temTimes = tc !== null && tf !== null;
      // grupos: so grava se houver placar (times sao oficiais, nao dado do admin).
      // mata-mata: grava se houver placar OU se os times reais foram informados.
      const persistir = ehGrupos ? temPlacar : temPlacar || temTimes;
      if (persistir) {
        upsertResultado.run({
          jogo_numero: n,
          gols_casa: gc,
          gols_fora: gf,
          time_casa: tc,
          time_fora: tf,
          penaltis_casa: penc,
          penaltis_fora: penf,
          atualizado_em: agora,
        });
      } else {
        apagaResultado.run(n); // limpou tudo -> remove resultado
      }
    }
  });
  tx();
  res.redirect(`/admin?fase=${encodeURIComponent(fase)}&salvou=1`);
});

app.post('/admin/especiais', exigeAdmin, (req, res) => {
  db.prepare(
    'UPDATE resultados_especiais SET artilheiro=?, campeao=? WHERE id=1',
  ).run(txtOuNull(req.body.artilheiro), txtOuNull(req.body.campeao));
  res.redirect('/admin?fase=final&salvou=1');
});

app.get('/admin/contatos', exigeAdmin, (req, res) => {
  const jogadores = db.prepare(
    'SELECT id, COALESCE(NULLIF(nome_exibicao, \'\'), nome) AS nome, email, whatsapp, pago FROM jogadores ORDER BY nome',
  ).all();
  const { geral, faseGrupos } = rankingCompleto(db);
  const { premios, pool } = calculaPremios({
    cfg: CFG_PREMIACAO, geral, faseGrupos, nPagantes: nPagantes(db),
  });
  res.render('admin-contatos', {
    jogadores, premios, pool, nPagantes: nPagantes(db),
    valorAposta: CFG_PREMIACAO.valorAposta, salvou: req.query.salvou === '1',
  });
});

const upsertContato = db.prepare(
  'UPDATE jogadores SET nome_exibicao=@nome, email=@email, whatsapp=@whatsapp, pago=@pago WHERE id=@id',
);
app.post('/admin/contatos', exigeAdmin, (req, res) => {
  const ids = db.prepare('SELECT id FROM jogadores').all().map((r) => r.id);
  const tx = db.transaction(() => {
    for (const id of ids) {
      const nome = txtOuNull(req.body[`nome_${id}`]);
      if (nome === null) continue; // nome de exibicao nao pode ficar vazio
      upsertContato.run({
        id,
        nome,
        email: txtOuNull(req.body[`email_${id}`]),
        whatsapp: txtOuNull(req.body[`whats_${id}`]),
        pago: req.body[`pago_${id}`] ? 1 : 0,
      });
    }
  });
  tx();
  res.redirect('/admin/contatos?salvou=1');
});

// Atalho: marca todos como pago (todos pagaram) / ou desmarca todos.
app.post('/admin/contatos/pago-todos', exigeAdmin, (req, res) => {
  const valor = req.body.desmarcar ? 0 : 1;
  db.prepare('UPDATE jogadores SET pago = ?').run(valor);
  res.redirect('/admin/contatos?salvou=1');
});

app.use((req, res) => res.status(404).render('404'));

// sobe o servidor por padrao; testes podem importar o app com BOLAO_NO_LISTEN=1
if (process.env.BOLAO_NO_LISTEN !== '1') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`${NOME_BOLAO} rodando em http://localhost:${PORT}`);
  });
  // Placar ao vivo agora vem da ESPN (iniciaAgendadorDetalheVivo grava
  // resultados_ao_vivo) — football-data desligada p/ live (evita atraso/conflito).
  iniciaAgendadorOdds(db); // odds de mercado (so se BOLAO_ODDS_API_TOKEN existir)
  iniciaAgendadorDetalheVivo(db); // placar + minuto + autores + cartoes ao vivo (ESPN); alimenta /artilheiros
}

export default app;
