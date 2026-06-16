// Backfill de odds de mercado via ESPN (roda uma vez e sai).
// Equivale a um ciclo manual do agendador: busca o scoreboard da Copa inteira,
// calcula as probabilidades implicitas a partir dos moneylines (pickcenter) e
// grava em odds_mercado para TODOS os jogos com dados disponiveis (incluindo
// encerrados com odds historicas que a ESPN ainda retorna).
//
// Uso:  node scripts/odds-backfill.js
import { getDb } from '../src/db.js';
import { sincronizaOdds } from '../src/odds.js';

const db = getDb();
console.log('Backfill de odds (ESPN) iniciado...');
try {
  const n = await sincronizaOdds(db);
  console.log(`Odds de mercado gravadas/atualizadas: ${n} jogo(s).`);
} catch (e) {
  console.error('Erro no backfill de odds:', e.message);
  process.exit(1);
}
