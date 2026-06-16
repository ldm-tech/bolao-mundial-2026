// Relogio do jogo ao vivo. A API da o minuto inteiro (ex.: 29); aqui o segundo
// "corre" no cliente entre as atualizacoes, com cara de site de esportes
// (29:00, 29:01...). Re-ancora quando o auto-refresh troca o miolo (gol/mudanca).
(function () {
  let timer = null;

  function pinta() {
    const els = document.querySelectorAll('.relogio-vivo');
    if (!els.length) {
      if (timer) { clearInterval(timer); timer = null; }
      return;
    }
    const agora = Date.now();
    els.forEach((el) => {
      if ((el.dataset.status || '') === 'PAUSED') {
        el.textContent = 'Intervalo';
        return;
      }
      const base = parseInt(el.dataset.min, 10);
      if (Number.isNaN(base)) return;
      const ac = parseInt(el.dataset.ac || '0', 10) || 0;
      // em acrescimo, mostra "45+2'" estatico (nao da pra cravar o segundo)
      if (ac > 0) {
        el.textContent = base + '+' + ac + "'";
        return;
      }
      // ancora: instante em que este elemento entrou na tela (sobrevive enquanto
      // o auto-refresh nao troca o miolo; troca = elemento novo = re-ancora)
      let t0 = +el.dataset.t0;
      if (!t0) { t0 = agora; el.dataset.t0 = String(t0); }
      const seg = base * 60 + Math.floor((agora - t0) / 1000);
      el.textContent = Math.floor(seg / 60) + ':' + String(seg % 60).padStart(2, '0');
    });
  }

  function liga() {
    pinta();
    if (timer) clearInterval(timer);
    if (document.querySelector('.relogio-vivo')) timer = setInterval(pinta, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', liga);
  } else {
    liga();
  }
  document.addEventListener('auto-refreshed', liga);
})();
