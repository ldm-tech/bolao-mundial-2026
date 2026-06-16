import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
// Caminho do banco lido PREGUICOSAMENTE (na 1a abertura), nao no import — assim
// quem importa db.js ainda pode definir BOLAO_DB antes de chamar getDb().
export function caminhoDb() {
  return process.env.BOLAO_DB || join(DATA_DIR, 'bolao.db');
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jogadores (
  id INTEGER PRIMARY KEY,
  nome TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS jogos (
  numero INTEGER PRIMARY KEY,
  fase TEXT NOT NULL,
  data TEXT, hora TEXT, cidade TEXT, pais TEXT,
  time_casa TEXT, time_fora TEXT
);
CREATE TABLE IF NOT EXISTS palpites (
  jogador_id INTEGER NOT NULL REFERENCES jogadores(id),
  jogo_numero INTEGER NOT NULL REFERENCES jogos(numero),
  gols_casa INTEGER, gols_fora INTEGER,
  time_casa TEXT, time_fora TEXT,
  penaltis_casa INTEGER, penaltis_fora INTEGER,
  PRIMARY KEY (jogador_id, jogo_numero)
);
CREATE TABLE IF NOT EXISTS palpites_especiais (
  jogador_id INTEGER PRIMARY KEY REFERENCES jogadores(id),
  artilheiro TEXT, campeao TEXT, finalista_1 TEXT, finalista_2 TEXT
);
CREATE TABLE IF NOT EXISTS resultados (
  jogo_numero INTEGER PRIMARY KEY REFERENCES jogos(numero),
  gols_casa INTEGER, gols_fora INTEGER,
  time_casa TEXT, time_fora TEXT,
  penaltis_casa INTEGER, penaltis_fora INTEGER,
  atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS resultados_especiais (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  artilheiro TEXT, campeao TEXT
);
CREATE TABLE IF NOT EXISTS classificacao_grupos (
  jogador_id INTEGER NOT NULL REFERENCES jogadores(id),
  grupo TEXT NOT NULL,       -- A..L
  posicao INTEGER NOT NULL,  -- 1..4
  time TEXT,
  PRIMARY KEY (jogador_id, grupo, posicao)
);
CREATE TABLE IF NOT EXISTS resultados_ao_vivo (
  jogo_numero INTEGER PRIMARY KEY REFERENCES jogos(numero),
  gols_casa INTEGER, gols_fora INTEGER,
  status TEXT,             -- status da API (IN_PLAY, PAUSED, FINISHED...)
  atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS odds_mercado (
  jogo_numero INTEGER PRIMARY KEY REFERENCES jogos(numero),
  prob_casa REAL, prob_empate REAL, prob_fora REAL,  -- normalizadas (somam 1)
  atualizado_em TEXT
);
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
`;

let _db;

export function getDb() {
  if (_db) return _db;
  // cria a pasta do proprio caminho do banco (suporta BOLAO_DB fora de ./data,
  // ex.: /data/bolao.db num volume Docker)
  const dbPath = caminhoDb();
  mkdirSync(dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  // tolera locks curtos: no deploy zero-downtime (start-first) dois containers
  // compartilham o mesmo arquivo por alguns segundos; espera ate 5s em vez de
  // estourar SQLITE_BUSY na escrita concorrente.
  _db.pragma('busy_timeout = 5000');
  _db.exec(SCHEMA);
  migra(_db);
  // garante a linha unica de especiais reais
  _db.prepare('INSERT OR IGNORE INTO resultados_especiais (id) VALUES (1)').run();
  return _db;
}

// migracoes leves para bancos criados antes de novas colunas existirem
function migra(db) {
  const cols = db.prepare('PRAGMA table_info(resultados)').all().map((c) => c.name);
  if (!cols.includes('penaltis_casa')) db.exec('ALTER TABLE resultados ADD COLUMN penaltis_casa INTEGER');
  if (!cols.includes('penaltis_fora')) db.exec('ALTER TABLE resultados ADD COLUMN penaltis_fora INTEGER');

  const colsP = db.prepare('PRAGMA table_info(palpites)').all().map((c) => c.name);
  if (!colsP.includes('penaltis_casa')) db.exec('ALTER TABLE palpites ADD COLUMN penaltis_casa INTEGER');
  if (!colsP.includes('penaltis_fora')) db.exec('ALTER TABLE palpites ADD COLUMN penaltis_fora INTEGER');

  const colsJ = db.prepare('PRAGMA table_info(jogadores)').all().map((c) => c.name);
  if (!colsJ.includes('chave')) db.exec('ALTER TABLE jogadores ADD COLUMN chave TEXT');
  if (!colsJ.includes('nome_exibicao')) db.exec('ALTER TABLE jogadores ADD COLUMN nome_exibicao TEXT');
  if (!colsJ.includes('email')) db.exec('ALTER TABLE jogadores ADD COLUMN email TEXT');
  if (!colsJ.includes('whatsapp')) db.exec('ALTER TABLE jogadores ADD COLUMN whatsapp TEXT');
  if (!colsJ.includes('pago')) db.exec('ALTER TABLE jogadores ADD COLUMN pago INTEGER NOT NULL DEFAULT 0');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_jogadores_chave ON jogadores(chave) WHERE chave IS NOT NULL');
}

export function getConfig(chave) {
  const row = getDb().prepare('SELECT valor FROM config WHERE chave = ?').get(chave);
  return row ? row.valor : null;
}

export function setConfig(chave, valor) {
  getDb()
    .prepare(
      'INSERT INTO config (chave, valor) VALUES (?, ?) ' +
        'ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor',
    )
    .run(chave, valor);
}
