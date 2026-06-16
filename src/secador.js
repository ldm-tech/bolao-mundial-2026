// "Quem secar": num jogo AO VIVO, quem ainda pode CRAVAR o placar exato.
// Gol so aumenta, entao o palpite precisa ser >= o placar atual nos DOIS lados;
// se um time ja passou do palpite, aquele exato ficou impossivel (estourou).
//   - cravando: palpite == placar atual agora (35 pts se acabar assim)
//   - disputa:  ainda alcancavel, ordenado por menos gols faltando, top N
// palpites: [{ nome, gols_casa, gols_fora }]
export function montaSecador(palpites, rc, rf, topN = 8) {
  const cravando = [];
  const disputa = [];
  for (const p of palpites || []) {
    if (p.gols_casa == null || p.gols_fora == null) continue;
    if (p.gols_casa < rc || p.gols_fora < rf) continue; // um lado estourou -> fora
    const faltamCasa = p.gols_casa - rc;
    const faltamFora = p.gols_fora - rf;
    const faltam = faltamCasa + faltamFora;
    if (faltam === 0) cravando.push({ nome: p.nome });
    else disputa.push({ nome: p.nome, alvoCasa: p.gols_casa, alvoFora: p.gols_fora, faltamCasa, faltamFora, faltam });
  }
  cravando.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  disputa.sort((a, b) => a.faltam - b.faltam || a.nome.localeCompare(b.nome, 'pt-BR'));
  const restante = Math.max(0, disputa.length - topN);
  return { cravando, disputa: disputa.slice(0, topN), restante };
}
