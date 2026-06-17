// Busca por seleção na tela de jogos. Filtra os cards pelo nome dos times
// (data-times). Enquanto há busca, abre todos os dias e esconde os que ficaram
// sem nenhum jogo; ao limpar, restaura o accordion (só o dia inicial aberto).
// Re-aplica após o auto-refresh trocar o miolo.
(function () {
  const input = document.getElementById('busca-jogo');
  if (!input) return;

  const COMBINANTES = /[̀-ͯ]/g; // acentos após normalizar p/ NFD
  const norm = (s) => (s || '').normalize('NFD').replace(COMBINANTES, '').toLowerCase().trim();

  function aplica() {
    const q = norm(input.value);
    const buscando = q.length > 0;
    const cards = document.querySelectorAll('#lista-jogos .jogo-card');
    let visiveis = 0;

    cards.forEach((card) => {
      const bate = !buscando || norm(card.dataset.times).includes(q);
      card.style.display = bate ? '' : 'none';
      if (bate && buscando) visiveis += 1;
    });

    // accordion (só existe na fase de grupos)
    document.querySelectorAll('#lista-jogos details.dia').forEach((det) => {
      if (buscando) {
        det.open = true;
        const algum = [...det.querySelectorAll('.jogo-card')].some((c) => c.style.display !== 'none');
        det.style.display = algum ? '' : 'none';
      } else {
        det.style.display = '';
        det.open = det.hasAttribute('data-inicial');
      }
    });

    const aviso = document.querySelector('.jogos-busca__vazio');
    if (aviso) aviso.hidden = !(buscando && visiveis === 0);
  }

  input.addEventListener('input', aplica);
  document.addEventListener('auto-refreshed', aplica);
})();
