// Ranking: busca por nome + multi-pin. Clique no 📌 de uma linha para fixá-la no
// topo (painel "Fixados"); clique de novo para soltar. Vários ao mesmo tempo,
// lembrados em localStorage. Re-aplica após o auto-refresh trocar o miolo.
(function () {
  const CHAVE = 'bolao-pins';
  const ANTIGO = 'bolao-meu-nome'; // migra o "fixar 1" antigo

  function normaliza(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
  function getPins() {
    try {
      const arr = JSON.parse(localStorage.getItem(CHAVE) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function setPins(arr) {
    localStorage.setItem(CHAVE, JSON.stringify(arr));
  }
  function migra() {
    if (localStorage.getItem(CHAVE) === null) {
      const antigo = localStorage.getItem(ANTIGO);
      if (antigo) setPins([antigo]);
    }
  }
  function togglePin(nome) {
    const pins = getPins();
    const i = pins.findIndex((n) => normaliza(n) === normaliza(nome));
    if (i >= 0) pins.splice(i, 1);
    else pins.push(nome);
    setPins(pins);
    render();
    document.dispatchEvent(new CustomEvent('fixados-mudou'));
  }

  function render() {
    const input = document.getElementById('busca-jogador');
    const lista = document.getElementById('ranking-linhas');
    const painel = document.getElementById('fixados-painel');
    const fixados = document.getElementById('fixados-linhas');
    const contagem = document.getElementById('fixados-contagem');
    if (!lista || !painel || !fixados) return;

    const termo = normaliza(input ? input.value : '');
    const pinSet = new Set(getPins().map(normaliza));
    const linhas = [...lista.querySelectorAll('[data-nome]')];

    fixados.innerHTML = '';
    linhas.forEach((tr) => {
      const n = normaliza(tr.dataset.nome);
      const pinned = pinSet.has(n);
      const casaBusca = !termo || n.includes(termo);
      // fixados aparecem no topo E continuam na lista principal (realcados);
      // todos respeitam a busca
      tr.hidden = !casaBusca;
      tr.classList.toggle('is-pinned', pinned);
      if (pinned) {
        const clone = document.createElement('tr');
        clone.dataset.nome = tr.dataset.nome;
        clone.className = 'is-pinned';
        clone.innerHTML = tr.innerHTML;
        fixados.appendChild(clone);
      }
    });

    const total = pinSet.size;
    painel.hidden = total === 0;
    if (contagem) contagem.textContent = total + (total === 1 ? ' fixado' : ' fixados');
  }

  function onClick(e) {
    const btn = e.target.closest('[data-pin]');
    if (!btn) return;
    e.preventDefault();
    const tr = btn.closest('[data-nome]');
    if (tr) togglePin(tr.dataset.nome);
  }

  function liga() {
    const input = document.getElementById('busca-jogador');
    if (input && !input.dataset.ligado) {
      input.dataset.ligado = '1';
      input.addEventListener('input', render);
    }
    // clique nos 📌 (delegado no document; sobrevive aos swaps do auto-refresh)
    if (!document.body.dataset.pinLigado) {
      document.body.dataset.pinLigado = '1';
      document.addEventListener('click', onClick);
    }
  }

  document.addEventListener('DOMContentLoaded', () => { migra(); liga(); render(); });
  document.addEventListener('auto-refreshed', () => { liga(); render(); });
})();
