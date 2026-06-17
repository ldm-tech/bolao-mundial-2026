// Caixinha "Seus fixados" nos cards de jogo: mostra o palpite das pessoas que o
// usuário fixou no ranking (📌). Os fixados vivem no localStorage (mesma chave do
// ranking-busca.js), por nome. Monta no cliente clonando os palpites já presentes
// no card. Re-aplica após o auto-refresh e quando os fixados mudam.
(function () {
  const CHAVE = 'bolao-pins';
  const norm = (s) =>
    (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  function pins() {
    try {
      return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]').map(norm));
    } catch (e) {
      return new Set();
    }
  }

  function monta() {
    const set = pins();
    document.querySelectorAll('#lista-jogos .jogo-card').forEach((card) => {
      const antiga = card.querySelector('.fixados-jogo');
      if (antiga) antiga.remove();
      if (!set.size) return;

      const itens = [...card.querySelectorAll('.palpite-item')].filter((el) =>
        set.has(norm(el.dataset.nome || '')),
      );
      if (!itens.length) return;

      const box = document.createElement('div');
      box.className = 'fixados-jogo';
      const tit = document.createElement('div');
      tit.className = 'fixados-jogo__tit';
      tit.textContent = '📌 Seus fixados';
      box.appendChild(tit);

      const grid = document.createElement('div');
      grid.className = 'palpites-grid';
      itens.forEach((el) => grid.appendChild(el.cloneNode(true)));
      box.appendChild(grid);

      // antes do "Quem secar"; se não houver, antes da lista de palpites
      const ref = card.querySelector('.secador') || card.querySelector('.palpites-lista');
      if (ref) card.insertBefore(box, ref);
      else card.appendChild(box);
    });
  }

  document.addEventListener('DOMContentLoaded', monta);
  document.addEventListener('auto-refreshed', monta);
  document.addEventListener('fixados-mudou', monta);
  if (document.readyState !== 'loading') monta();
})();
