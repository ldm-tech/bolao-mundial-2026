import { normalizaTime } from './scoring.js';

// Mapa das 48 selecoes da Copa 2026.
// code = arquivo da bandeira (ISO 3166-1 alpha-2, ou subdivisao gb-*).
// nome = forma canonica usada para casar (via normalizaTime).
// tla  = sigla FIFA de 3 letras (usada p/ casar com a ESPN e outras fontes).
// label = texto curto exibido no chip.
const TIMES = [
  { code: 'de', tla: 'GER', nome: 'Alemanha' },
  { code: 'ar', tla: 'ARG', nome: 'Argentina' },
  { code: 'dz', tla: 'ALG', nome: 'Argélia' },
  { code: 'sa', tla: 'KSA', nome: 'Arábia Saudita', label: 'Arábia S.' },
  { code: 'au', tla: 'AUS', nome: 'Austrália' },
  { code: 'br', tla: 'BRA', nome: 'Brasil' },
  { code: 'be', tla: 'BEL', nome: 'Bélgica' },
  { code: 'ba', tla: 'BIH', nome: 'Bósnia' },
  { code: 'cv', tla: 'CPV', nome: 'Cabo Verde' },
  { code: 'ca', tla: 'CAN', nome: 'Canadá' },
  { code: 'qa', tla: 'QAT', nome: 'Catar' },
  { code: 'co', tla: 'COL', nome: 'Colômbia' },
  { code: 'kr', tla: 'KOR', nome: 'Coreia do Sul' },
  { code: 'ci', tla: 'CIV', nome: 'Costa do Marfim' },
  { code: 'hr', tla: 'CRO', nome: 'Croácia' },
  { code: 'cw', tla: 'CUW', nome: 'Curaçao' },
  { code: 'eg', tla: 'EGY', nome: 'Egito' },
  { code: 'ec', tla: 'ECU', nome: 'Equador' },
  { code: 'gb-sct', tla: 'SCO', nome: 'Escócia' },
  { code: 'es', tla: 'ESP', nome: 'Espanha' },
  { code: 'us', tla: 'USA', nome: 'Estados Unidos', label: 'EUA' },
  { code: 'fr', tla: 'FRA', nome: 'França' },
  { code: 'gh', tla: 'GHA', nome: 'Gana' },
  { code: 'ht', tla: 'HAI', nome: 'Haiti' },
  { code: 'nl', tla: 'NED', nome: 'Holanda' },
  { code: 'gb-eng', tla: 'ENG', nome: 'Inglaterra' },
  { code: 'iq', tla: 'IRQ', nome: 'Iraque' },
  { code: 'ir', tla: 'IRN', nome: 'Irã' },
  { code: 'jp', tla: 'JPN', nome: 'Japão' },
  { code: 'jo', tla: 'JOR', nome: 'Jordânia' },
  { code: 'ma', tla: 'MAR', nome: 'Marrocos' },
  { code: 'mx', tla: 'MEX', nome: 'México' },
  { code: 'no', tla: 'NOR', nome: 'Noruega' },
  { code: 'nz', tla: 'NZL', nome: 'Nova Zelândia', label: 'N. Zelândia' },
  { code: 'pa', tla: 'PAN', nome: 'Panamá' },
  { code: 'py', tla: 'PAR', nome: 'Paraguai' },
  { code: 'pt', tla: 'POR', nome: 'Portugal' },
  { code: 'cd', tla: 'COD', nome: 'RD Congo' },
  { code: 'cz', tla: 'CZE', nome: 'República Tcheca', label: 'Rep. Tcheca' },
  { code: 'sn', tla: 'SEN', nome: 'Senegal' },
  { code: 'se', tla: 'SWE', nome: 'Suécia' },
  { code: 'ch', tla: 'SUI', nome: 'Suíça' },
  { code: 'tn', tla: 'TUN', nome: 'Tunísia' },
  { code: 'tr', tla: 'TUR', nome: 'Turquia' },
  { code: 'uy', tla: 'URY', nome: 'Uruguai' },
  { code: 'uz', tla: 'UZB', nome: 'Uzbequistão' },
  { code: 'za', tla: 'RSA', nome: 'África do Sul' },
  { code: 'at', tla: 'AUT', nome: 'Áustria' },
];

const PORNOME = new Map();
const PORTLA = new Map();
for (const t of TIMES) {
  PORNOME.set(normalizaTime(t.nome), t);
  // tambem indexa pelo label (ex.: dado guarda "Arábia S." em vez de "Arábia Saudita")
  if (t.label) {
    const ln = normalizaTime(t.label);
    if (!PORNOME.has(ln)) PORNOME.set(ln, t);
  }
  PORTLA.set(t.tla, t);
}

// lista de codigos unicos (para o script que baixa as bandeiras)
export const CODIGOS = TIMES.map((t) => t.code);

// devolve { code, label, src } para um nome de selecao, ou null se nao mapear.
export function bandeira(nome) {
  const t = PORNOME.get(normalizaTime(nome));
  if (!t) return null;
  return { code: t.code, label: t.label || t.nome, src: `/flags/${t.code}.svg` };
}

// codigo ISO a partir de um nome de selecao (ou null)
export function codigoDoNome(nome) {
  const t = PORNOME.get(normalizaTime(nome));
  return t ? t.code : null;
}

// codigo ISO a partir da sigla FIFA da API (ex.: 'BRA' -> 'br'); ou null
export function codigoDaTla(tla) {
  const t = PORTLA.get(tla);
  return t ? t.code : null;
}

// nomes em ingles usados pela the-odds-api -> codigo ISO
const INGLES = {
  Algeria: 'dz', Argentina: 'ar', Australia: 'au', Austria: 'at', Belgium: 'be',
  'Bosnia & Herzegovina': 'ba', Brazil: 'br', Canada: 'ca', 'Cape Verde': 'cv',
  Colombia: 'co', Croatia: 'hr', 'Curaçao': 'cw', 'Czech Republic': 'cz',
  'DR Congo': 'cd', Ecuador: 'ec', Egypt: 'eg', England: 'gb-eng', France: 'fr',
  Germany: 'de', Ghana: 'gh', Haiti: 'ht', Iran: 'ir', Iraq: 'iq', 'Ivory Coast': 'ci',
  Japan: 'jp', Jordan: 'jo', Mexico: 'mx', Morocco: 'ma', Netherlands: 'nl',
  'New Zealand': 'nz', Norway: 'no', Panama: 'pa', Paraguay: 'py', Portugal: 'pt',
  Qatar: 'qa', 'Saudi Arabia': 'sa', Scotland: 'gb-sct', Senegal: 'sn',
  'South Africa': 'za', 'South Korea': 'kr', Spain: 'es', Sweden: 'se',
  Switzerland: 'ch', Tunisia: 'tn', Turkey: 'tr', USA: 'us', Uruguay: 'uy',
  Uzbekistan: 'uz',
};
const normEn = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const PORINGLES = new Map(Object.entries(INGLES).map(([en, code]) => [normEn(en), code]));

// codigo ISO a partir do nome em ingles da the-odds-api; ou null
export function codigoDoIngles(nome) {
  return PORINGLES.get(normEn(nome)) || null;
}
