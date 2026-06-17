// Agrupamento da tela de jogos por DIA (usado só na fase de grupos, que tem 72
// jogos). Cada dia vira um accordion; por padrão abre um só. Função pura e
// testável: recebe a `lista` montada pela rota /jogos e a data de hoje (YYYY-MM-DD).

// Escolha do dia aberto, por prioridade: dia com jogo AO VIVO > hoje > próximo
// dia futuro com jogos > último dia (tudo encerrado).
export function agrupaPorDia(lista, hoje) {
  const mapa = new Map();
  for (const item of lista) {
    const d = (item.jogo && item.jogo.data) || 'sem-data';
    if (!mapa.has(d)) mapa.set(d, []);
    mapa.get(d).push(item);
  }
  const dias = [...mapa.entries()]
    .map(([data, jogos]) => ({
      data,
      jogos,
      temAoVivo: jogos.some((i) => i.estadoVivo === 'ao_vivo'),
    }))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));

  const aberto =
    dias.find((d) => d.temAoVivo) ||
    dias.find((d) => d.data === hoje) ||
    dias.find((d) => d.data >= hoje) ||
    dias[dias.length - 1];

  return { dias, diaAberto: aberto ? aberto.data : null };
}
