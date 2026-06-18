// Grafico de evolucao da POSICAO no ranking (jogo a jogo) dos jogadores FIXADOS.
// SVG desenhado a mao, sem dependencia. Eixo Y invertido: 1º no topo (posicao
// menor = melhor = mais alto). Re-desenha quando os pins mudam ('fixados-mudou')
// ou o ranking atualiza ('auto-refreshed').
(function () {
  const CORES = ['#157347', '#cc8a00', '#2b6cb0', '#c0392b', '#6b46c1', '#0f9d8f', '#d2691e', '#b83280', '#4a5568', '#7cb342'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function idsFixados() {
    return [...document.querySelectorAll('#ranking-linhas tr.is-pinned')]
      .map((tr) => parseInt(tr.dataset.id, 10))
      .filter(Number.isInteger);
  }

  let t = null;
  function agenda() {
    clearTimeout(t);
    t = setTimeout(desenha, 120);
  }

  async function desenha() {
    const el = document.getElementById('evo-grafico');
    if (!el) return;
    const todos = el.dataset.todos === '1'; // modo familia: mostra todos (sem pins)
    let url;
    let idsParaCor;
    if (todos) {
      url = '/api/evolucao?todos=1';
    } else {
      const ids = idsFixados();
      if (!ids.length) {
        el.hidden = true;
        el.innerHTML = '';
        return;
      }
      url = '/api/evolucao?ids=' + ids.join(',');
      idsParaCor = ids;
    }
    let dados;
    try {
      dados = await (await fetch(url, { cache: 'no-store' })).json();
    } catch (e) {
      return;
    }
    if (todos) idsParaCor = (dados.series || []).map((s) => s.id);
    render(el, dados, idsParaCor);
  }

  function render(el, dados, ids) {
    const jogos = dados.jogos || [];
    const series = dados.series || [];
    el.hidden = false;
    if (!jogos.length || !series.length) {
      el.innerHTML = '<div class="evo__titulo">📈 Evolução da posição</div>'
        + '<p class="evo__vazio">Ainda não há jogos computados para mostrar a evolução.</p>';
      return;
    }

    const W = 640, H = 230, ml = 30, mr = 10, mt = 12, mb = 22, n = jogos.length;
    // eixo de posicao: 1 (topo) ate a pior posicao que aparece nas series
    const maxPos = Math.max(2, ...series.flatMap((s) => s.pos));
    const px = (i) => ml + (n === 1 ? (W - ml - mr) / 2 : (i * (W - ml - mr)) / (n - 1));
    const py = (p) => mt + ((p - 1) * (H - mt - mb)) / (maxPos - 1); // 1 no topo
    const corDe = (id) => CORES[Math.max(0, ids.indexOf(id)) % CORES.length];
    const ult = (s) => s.pos[s.pos.length - 1];

    let g = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="evo__svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Evolução da posição no ranking dos fixados, jogo a jogo (1º no topo)">';
    // linhas de grade: 1º, meio e a pior posicao
    [1, Math.round((1 + maxPos) / 2), maxPos].forEach((p) => {
      const yy = py(p);
      g += '<line x1="' + ml + '" y1="' + yy + '" x2="' + (W - mr) + '" y2="' + yy + '" class="evo__grid"/>';
      g += '<text x="' + (ml - 4) + '" y="' + (yy + 3) + '" class="evo__yl">' + p + 'º</text>';
    });
    const passo = Math.max(1, Math.ceil(n / 8));
    jogos.forEach((j, i) => {
      if (i % passo === 0 || i === n - 1) {
        g += '<text x="' + px(i) + '" y="' + (H - 6) + '" class="evo__xl">' + j.numero + '</text>';
      }
    });
    series.forEach((s) => {
      const c = corDe(s.id);
      g += '<polyline points="' + s.pos.map((p, i) => px(i) + ',' + py(p)).join(' ') + '" fill="none" stroke="' + c + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>';
      g += s.pos.map((p, i) => '<circle cx="' + px(i) + '" cy="' + py(p) + '" r="2.4" fill="' + c + '"/>').join('');
    });
    g += '<line class="evo__guia" x1="0" y1="' + mt + '" x2="0" y2="' + (H - mb) + '" style="display:none"/>';
    g += '<rect class="evo__hit" x="' + ml + '" y="' + mt + '" width="' + (W - ml - mr) + '" height="' + (H - mt - mb) + '" fill="transparent"/>';
    g += '</svg>';

    let leg = '<div class="evo__leg">';
    series.forEach((s) => {
      leg += '<span class="evo__leg-item"><i style="background:' + corDe(s.id) + '"></i>' + esc(s.nome) + ' · <b>' + ult(s) + 'º</b></span>';
    });
    leg += '</div>';

    el.innerHTML = '<div class="evo__titulo">📈 Evolução da posição <span class="evo__dica">— 1º no topo · toque para detalhar</span></div>'
      + '<div class="evo__wrap">' + g + '<div class="evo__tip" hidden></div></div>' + leg;

    const svgEl = el.querySelector('.evo__svg');
    const guia = el.querySelector('.evo__guia');
    const hit = el.querySelector('.evo__hit');
    const tip = el.querySelector('.evo__tip');

    function mostra(clientX) {
      const r = svgEl.getBoundingClientRect();
      const sx = ((clientX - r.left) / r.width) * W;
      let i = n === 1 ? 0 : Math.round((sx - ml) / ((W - ml - mr) / (n - 1)));
      i = Math.max(0, Math.min(n - 1, i));
      const gx = px(i);
      guia.setAttribute('x1', gx);
      guia.setAttribute('x2', gx);
      guia.style.display = '';
      const ord = series.slice().sort((a, b) => a.pos[i] - b.pos[i]); // 1º primeiro
      tip.innerHTML = '<div class="evo__tip-h">Jogo ' + jogos[i].numero + '</div>'
        + ord.map((s) => '<span><i style="background:' + corDe(s.id) + '"></i>' + esc(s.nome) + ': <b>' + s.pos[i] + 'º</b> (' + s.acum[i] + ' pts)</span>').join('');
      tip.hidden = false;
    }
    function esconde() {
      guia.style.display = 'none';
      tip.hidden = true;
    }
    hit.addEventListener('pointermove', (e) => mostra(e.clientX));
    hit.addEventListener('pointerdown', (e) => mostra(e.clientX));
    hit.addEventListener('pointerleave', esconde);
  }

  document.addEventListener('DOMContentLoaded', agenda);
  document.addEventListener('fixados-mudou', agenda);
  document.addEventListener('auto-refreshed', agenda);
  if (document.readyState !== 'loading') agenda();
})();
