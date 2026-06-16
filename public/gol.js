// Comemoracao de gol. Ouve o evento 'auto-refreshed' (disparado pelo
// auto-refresh.js depois de trocar o placar), compara com o retrato anterior e,
// se um jogo AO VIVO ganhou gol, dispara a festa. Totalmente desacoplado do
// auto-refresh e do servidor. Som desligado por padrao (botao liga).
(function () {
  const root = document.querySelector('[data-auto-refresh]');
  if (!root || !root.querySelector('.jogo-card')) return; // so na tela de jogos

  const SOM_KEY = 'bolao-gol-som';
  let somLigado = localStorage.getItem(SOM_KEY) === '1';
  let actx = null;

  // Le os placares atuais por jogo: { casa, fora, aoVivo } indexado por id do card.
  function lerPlacares(scope) {
    const mapa = new Map();
    scope.querySelectorAll('.jogo-card[id^="jogo-"]').forEach((card) => {
      const g = card.querySelector('.jogo-card__gols');
      const m = g && g.textContent.match(/(\d+)\s*:\s*(\d+)/);
      if (!m) return;
      mapa.set(card.id, {
        casa: +m[1],
        fora: +m[2],
        aoVivo: !!card.querySelector('.selo-vivo'),
      });
    });
    return mapa;
  }

  // Retrato inicial: nao comemora os placares que ja estavam na tela ao abrir.
  let anterior = lerPlacares(root);

  // Devolve { nome, flag } do lado que marcou. flag e um NO clonado (sem HTML
  // de string) para evitar qualquer risco de injecao.
  function timeDoLado(card, lado) {
    const casa = card.querySelector('.jogo-card__time--casa');
    const fora = [...card.querySelectorAll('.jogo-card__time')].find(
      (e) => !e.classList.contains('jogo-card__time--casa'),
    );
    const el = lado === 'casa' ? casa : fora;
    if (!el) return { nome: '', flag: null };
    const img = el.querySelector('img.flag');
    return { nome: el.textContent.trim(), flag: img ? img.cloneNode(true) : null };
  }

  function elem(cls, txt) {
    const d = document.createElement('div');
    d.className = cls;
    if (txt != null) d.textContent = txt;
    return d;
  }

  // Corneta de estadio sintetizada (Web Audio) — sem arquivo de audio.
  function toca() {
    if (!somLigado) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      [277.18, 220].forEach((f) => {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.connect(g).connect(actx.destination);
        o.start(t);
        o.stop(t + 1.15);
      });
    } catch (e) {
      /* audio bloqueado pelo navegador: ignora */
    }
  }

  function comemora(card, lado, placar) {
    const { nome, flag } = lado ? timeDoLado(card, lado) : { nome: '', flag: null };

    // pulso no card (reinicia a animacao se ja tiver a classe)
    card.classList.remove('jogo-card--gol');
    void card.offsetWidth;
    card.classList.add('jogo-card--gol');

    // overlay montado com nos do DOM (sem innerHTML)
    const ant = document.querySelector('.gol-pop');
    if (ant) ant.remove();

    const bola = elem('gol-pop__bola', '⚽');
    bola.setAttribute('aria-hidden', 'true');

    const cartao = elem('gol-pop__card');
    cartao.appendChild(elem('gol-pop__titulo', 'GOOOL!'));
    if (nome) {
      const time = elem('gol-pop__time');
      if (flag) time.appendChild(flag);
      const span = document.createElement('span');
      span.textContent = nome;
      time.appendChild(span);
      cartao.appendChild(time);
    }
    cartao.appendChild(elem('gol-pop__placar', placar.casa + ' : ' + placar.fora));

    const pop = elem('gol-pop');
    pop.appendChild(bola);
    pop.appendChild(cartao);
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 4200);

    toca();
    if (somLigado && navigator.vibrate) navigator.vibrate([120, 60, 160]);
  }

  document.addEventListener('auto-refreshed', () => {
    const atual = lerPlacares(root);
    for (const [id, novo] of atual) {
      const velho = anterior.get(id);
      if (!velho || !novo.aoVivo) continue; // sem base ou nao esta ao vivo
      const dC = novo.casa - velho.casa;
      const dF = novo.fora - velho.fora;
      const delta = dC + dF;
      // so gol "de verdade": incremento pequeno e nao-negativo (evita digitacao
      // de placar final em bloco no admin)
      if (delta >= 1 && delta <= 2 && dC >= 0 && dF >= 0) {
        const card = document.getElementById(id);
        const lado = dC > 0 && dF > 0 ? null : dC > 0 ? 'casa' : 'fora';
        if (card) comemora(card, lado, novo);
        break; // uma comemoracao por ciclo
      }
    }
    anterior = atual;
  });

  // botao de som (desligado por padrao)
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gol-som-toggle';
  function pinta() {
    btn.textContent = somLigado ? '🔊' : '🔇';
    btn.title = somLigado ? 'Som dos gols: ligado' : 'Som dos gols: desligado';
    btn.setAttribute('aria-pressed', String(somLigado));
    btn.setAttribute('aria-label', btn.title);
  }
  btn.addEventListener('click', () => {
    somLigado = !somLigado;
    localStorage.setItem(SOM_KEY, somLigado ? '1' : '0');
    pinta();
    if (somLigado) toca(); // gesto do usuario destrava o audio + da uma previa
  });
  pinta();
  document.body.appendChild(btn);
})();
