import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('jogadores ganha colunas chave/email/whatsapp/pago/nome_exibicao', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bolao-'));
  process.env.BOLAO_DB = join(dir, 't.db');
  const { getDb } = await import('../src/db.js?migra');
  const db = getDb();
  const cols = db.prepare('PRAGMA table_info(jogadores)').all().map((c) => c.name);
  for (const c of ['chave', 'email', 'whatsapp', 'pago', 'nome_exibicao']) {
    assert.ok(cols.includes(c), `falta coluna ${c}`);
  }
  db.close();
  delete process.env.BOLAO_DB;
  rmSync(dir, { recursive: true, force: true });
});
