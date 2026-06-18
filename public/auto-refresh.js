// Atualiza o conteudo da pagina em segundo plano, sem recarregar nem perder o
// scroll. Troca o miolo so quando a "versao" do estado muda (evita flicker) e
// preserva os <details> ("ver palpites") que estiverem abertos.
//
// Tambem detecta DEPLOY novo: cada versao do app marca o <body> com
// data-app-versao. Se ela mudar (saiu uma versao nova no servidor), o cliente
// que esta com a pagina aberta estaria rodando JS/CSS/HTML velhos — entao
// recarrega a pagina inteira. De forma nao-disruptiva: se a aba esta em segundo
// plano, recarrega na hora; se esta em foco, mostra um banner discreto e so
// recarrega quando a pessoa sai da aba (ou toca no banner).
(function () {
  const alvo = document.querySelector('[data-auto-refresh]');
  if (!alvo) return;

  const INTERVALO = 30000; // 30s
  const APP0 = document.body.dataset.appVersao || ''; // versao do app no load
  let visivel = !document.hidden;
  let novaVersao = false; // deploy detectado, aguardando recarregar

  document.addEventListener('visibilitychange', () => {
    visivel = !document.hidden;
    if (document.hidden && novaVersao) location.reload(); // recarrega "escondido"
  });

  function avisaNovaVersao() {
    novaVersao = true;
    if (document.hidden) {
      location.reload();
      return;
    }
    if (document.getElementById('novo-deploy')) return;
    const b = document.createElement('button');
    b.id = 'novo-deploy';
    b.className = 'novo-deploy';
    b.type = 'button';
    b.textContent = '✨ Nova versão — toque para atualizar';
    b.addEventListener('click', () => location.reload());
    document.body.appendChild(b);
  }

  async function atualiza() {
    if (!visivel) return;
    let html;
    try {
      const resp = await fetch(location.href, { cache: 'no-store' });
      if (!resp.ok) return;
      html = await resp.text();
    } catch (e) {
      return; // rede caiu; tenta no proximo ciclo
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // deploy novo? versao do app mudou -> recarrega tudo (JS/CSS/HTML novos)
    const appNovo = (doc.body && doc.body.dataset.appVersao) || '';
    if (APP0 && appNovo && appNovo !== APP0) {
      avisaNovaVersao();
      return;
    }

    const novo = doc.querySelector('[data-auto-refresh]');
    if (!novo) return;
    // nada mudou -> nao mexe (sem piscar, sem reanimar)
    if (novo.dataset.versao === alvo.dataset.versao) return;

    const abertos = new Set(
      [...alvo.querySelectorAll('details[data-key]')]
        .filter((d) => d.open)
        .map((d) => d.dataset.key),
    );
    const scrollY = window.scrollY;
    alvo.dataset.versao = novo.dataset.versao;
    alvo.innerHTML = novo.innerHTML;
    alvo.querySelectorAll('details[data-key]').forEach((d) => {
      if (abertos.has(d.dataset.key)) d.open = true;
    });
    window.scrollTo(0, scrollY);
    // avisa quem depende do miolo novo: comemoracao de gol (gol.js), re-ancora
    // do relogio (relogio-vivo.js) e re-desenho do grafico (evolucao.js).
    document.dispatchEvent(new CustomEvent('auto-refreshed'));
  }

  setInterval(atualiza, INTERVALO);
})();
