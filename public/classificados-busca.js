// Filtro simples por nome na tela de Classificados. So mostra/esconde os blocos
// .classif-pessoa conforme o termo — sem fixar nem lembrar (diferente do ranking).
(function () {
  const input = document.getElementById('busca-classif');
  if (!input) return;
  const vazio = document.getElementById('classif-vazio');

  function normaliza(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  input.addEventListener('input', function () {
    const termo = normaliza(input.value);
    const pessoas = document.querySelectorAll('.classif-pessoa[data-nome]');
    let visiveis = 0;
    pessoas.forEach(function (el) {
      const casa = !termo || normaliza(el.dataset.nome).includes(termo);
      // style.display inline vence o `.classif-pessoa{display:flex}` (o atributo
      // [hidden] sozinho nao esconde porque o flex tem prioridade).
      el.style.display = casa ? '' : 'none';
      if (casa) visiveis += 1;
    });
    if (vazio) vazio.hidden = visiveis !== 0;
  });
})();
