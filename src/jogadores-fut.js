// Canonizacao de nomes de jogador para a TELA DE ARTILHEIROS. O palpite de
// artilheiro e texto livre — cada participante escreve de um jeito (Mbappe,
// Kylian Mbappe, Mbape, Yamal, Vini Jr...). Aqui reduzimos tudo a um jogador
// canonico, pra contar quantos apostaram em cada um e casar com o dado da API.
// NAO e usado pela pontuacao (scoring.js segue exatamente como esta).

// Normaliza: tira acento, remove anotacoes entre parenteses "(tartaruga)" e
// apos " - " ("- Brasil"), minuscula, colapsa espacos.
export function normalizaNome(s) {
  if (s == null) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Jogador canonico -> apelidos/grafias (ja normalizados) que apontam pra ele.
// O `time` e best-effort (so pra bandeira de fallback); quando vier da API, o
// time real vem de la.
const CANONICOS = [
  { nome: 'Kylian Mbappé', time: 'França', aliases: ['mbappe', 'kylian mbappe', 'mbape', 'mpape'] },
  { nome: 'Harry Kane', time: 'Inglaterra', aliases: ['harry kane', 'kane'] },
  { nome: 'Lamine Yamal', time: 'Espanha', aliases: ['lamine yamal', 'yamal', 'lamine'] },
  { nome: 'Erling Haaland', time: 'Noruega', aliases: ['haaland', 'erling haaland'] },
  { nome: 'Vinícius Júnior', time: 'Brasil', aliases: ['vinicius junior', 'vini junior', 'vini jr', 'vinicius jr'] },
  { nome: 'Désiré Doué', time: 'França', aliases: ['desire doue'] },
  { nome: 'Endrick', time: 'Brasil', aliases: ['endrick'] },
  { nome: 'Ousmane Dembélé', time: 'França', aliases: ['dembele', 'ousmane dembele'] },
  { nome: 'Raphinha', time: 'Brasil', aliases: ['raphinha'] },
  { nome: 'Julián Álvarez', time: 'Argentina', aliases: ['julian alvarez', 'julian alvares', 'juliaaan alvares'] },
  { nome: 'Dani Olmo', time: 'Espanha', aliases: ['dani olmo'] },
  { nome: 'Gonçalo Ramos', time: 'Portugal', aliases: ['goncalo ramos'] },
  { nome: 'Lionel Messi', time: 'Argentina', aliases: ['messi', 'lionel messi'] },
  { nome: 'Romelu Lukaku', time: 'Bélgica', aliases: ['romelu lukaku', 'lukaku'] },
  { nome: 'Lautaro Martínez', time: 'Argentina', aliases: ['lautaro martinez', 'lautaro'] },
  { nome: 'Cristiano Ronaldo', time: 'Portugal', aliases: ['cristiano ronaldo', 'cr7', 'ronaldo'] },
  { nome: 'Michael Olise', time: 'França', aliases: ['olise'] },
  { nome: 'Igor Thiago', time: 'Brasil', aliases: ['igor thiago'] },
  { nome: 'Kai Havertz', time: 'Alemanha', aliases: ['kai havertz', 'havertz'] },
];

const PORALIAS = new Map();
for (const c of CANONICOS) {
  PORALIAS.set(normalizaNome(c.nome), c);
  for (const a of c.aliases) PORALIAS.set(a, c);
}

function titulo(s) {
  return s.replace(/\b\p{L}/gu, (m) => m.toUpperCase());
}

// Devolve { nome, time, canonico } para um palpite cru, ou null se vazio.
// canonico=false => caiu no fallback (grafia nao mapeada): vira "jogador proprio".
export function canoniza(texto) {
  const n = normalizaNome(texto);
  if (!n) return null;
  const c = PORALIAS.get(n);
  if (c) return { nome: c.nome, time: c.time, canonico: true };
  return { nome: titulo(n), time: null, canonico: false };
}
