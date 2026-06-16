// Atualiza o conteudo da pagina em segundo plano, sem recarregar nem perder o
// scroll. Troca o miolo so quando a "versao" do estado muda (evita flicker) e
// preserva os <details> ("ver palpites") que estiverem abertos.
(function () {
  const alvo = document.querySelector('[data-auto-refresh]');
  if (!alvo) return;

  const INTERVALO = 30000; // 30s
  let visivel = !document.hidden;
  document.addEventListener('visibilitychange', () => {
    visivel = !document.hidden;
  });

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
