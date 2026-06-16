// Botao flutuante de feedback (canto inferior esquerdo) -> POST /feedback -> Linear.
// So e injetado nas paginas quando o servidor habilita (dominio LDM + Linear configurado).
(function () {
  if (document.getElementById('fb-botao')) return;

  const botao = document.createElement('button');
  botao.id = 'fb-botao';
  botao.type = 'button';
  botao.className = 'fb-botao';
  botao.setAttribute('aria-haspopup', 'dialog');
  botao.innerHTML = '<span aria-hidden="true">💬</span> Feedback';

  const overlay = document.createElement('div');
  overlay.className = 'fb-overlay';
  overlay.hidden = true;
  overlay.innerHTML = [
    '<div class="fb-modal" role="dialog" aria-modal="true" aria-labelledby="fb-titulo">',
    '  <div class="fb-modal__topo">',
    '    <h2 id="fb-titulo">Enviar feedback</h2>',
    '    <button type="button" class="fb-x" aria-label="Fechar">&times;</button>',
    '  </div>',
    '  <form class="fb-form">',
    '    <label class="fb-label">Tipo',
    '      <select name="tipo" class="fb-input">',
    '        <option value="Bug">🐞 Bug / erro</option>',
    '        <option value="Sugestão">💡 Sugestão</option>',
    '      </select>',
    '    </label>',
    '    <label class="fb-label">Mensagem',
    '      <textarea name="mensagem" class="fb-input" rows="4" maxlength="4000" required placeholder="Descreva o que aconteceu ou sua ideia..."></textarea>',
    '    </label>',
    '    <label class="fb-label">Seu nome <span class="fb-opc">(opcional)</span>',
    '      <input type="text" name="nome" class="fb-input" maxlength="120" autocomplete="name" />',
    '    </label>',
    '    <input type="text" name="empresa" class="fb-hp" tabindex="-1" autocomplete="off" aria-hidden="true" />',
    '    <div class="fb-acoes">',
    '      <button type="button" class="fb-cancelar">Cancelar</button>',
    '      <button type="submit" class="fb-enviar">Enviar</button>',
    '    </div>',
    '    <p class="fb-status" role="status" aria-live="polite"></p>',
    '  </form>',
    '</div>',
  ].join('');

  document.body.appendChild(botao);
  document.body.appendChild(overlay);

  const modal = overlay.querySelector('.fb-modal');
  const form = overlay.querySelector('.fb-form');
  const status = overlay.querySelector('.fb-status');
  const enviar = overlay.querySelector('.fb-enviar');
  const textarea = overlay.querySelector('textarea[name="mensagem"]');

  function abre() {
    overlay.hidden = false;
    status.textContent = '';
    status.className = 'fb-status';
    setTimeout(() => textarea.focus(), 30);
  }
  function fecha() {
    overlay.hidden = true;
    botao.focus();
  }

  botao.addEventListener('click', abre);
  overlay.querySelector('.fb-x').addEventListener('click', fecha);
  overlay.querySelector('.fb-cancelar').addEventListener('click', fecha);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fecha(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) fecha(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const dados = {
      tipo: form.tipo.value,
      mensagem: form.mensagem.value,
      nome: form.nome.value,
      empresa: form.empresa.value, // honeypot
      url: location.href,
    };
    if (!dados.mensagem.trim()) return;
    enviar.disabled = true;
    status.className = 'fb-status';
    status.textContent = 'Enviando...';
    try {
      const resp = await fetch('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json.ok) {
        status.className = 'fb-status fb-status--ok';
        status.textContent = '✅ Obrigado! Seu feedback foi registrado.';
        form.reset();
        setTimeout(fecha, 1600);
      } else {
        status.className = 'fb-status fb-status--erro';
        status.textContent = json.erro || 'Não consegui enviar. Tente de novo.';
      }
    } catch (err) {
      status.className = 'fb-status fb-status--erro';
      status.textContent = 'Sem conexão. Tente novamente.';
    } finally {
      enviar.disabled = false;
    }
  });
})();
