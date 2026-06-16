import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bandeira, CODIGOS } from '../src/flags.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FLAGS_DIR = join(__dirname, '..', 'public', 'flags');

test('bandeira resolve nomes canonicos e variacoes entre planilhas', () => {
  assert.equal(bandeira('Brasil').code, 'br');
  assert.equal(bandeira('Qatar').code, 'qa'); // sinonimo de Catar
  assert.equal(bandeira('Catar').code, 'qa');
  assert.equal(bandeira('Rep. Tcheca').code, 'cz');
  assert.equal(bandeira('República Tcheca').code, 'cz');
  assert.equal(bandeira('Bósnia-Hezerg.').code, 'ba');
  assert.equal(bandeira('RD Congo').code, 'cd');
  assert.equal(bandeira('Curaçau').code, 'cw');
  assert.equal(bandeira('Arábia Saudita').code, 'sa');
  assert.equal(bandeira('Arábia S.').code, 'sa'); // dado guarda o label abreviado
});

test('bandeira distingue Suica (ch) de Suecia (se)', () => {
  assert.equal(bandeira('Suíça').code, 'ch');
  assert.equal(bandeira('Suécia').code, 'se');
});

test('Inglaterra e Escocia usam bandeiras de subdivisao', () => {
  assert.equal(bandeira('Inglaterra').code, 'gb-eng');
  assert.equal(bandeira('Escócia').code, 'gb-sct');
});

test('nome desconhecido devolve null', () => {
  assert.equal(bandeira('Atlântida'), null);
  assert.equal(bandeira(null), null);
});

test('todo codigo de bandeira tem o arquivo SVG correspondente', () => {
  for (const code of CODIGOS) {
    assert.ok(existsSync(join(FLAGS_DIR, `${code}.svg`)), `falta public/flags/${code}.svg`);
  }
});

test('sao 48 selecoes mapeadas', () => {
  assert.equal(new Set(CODIGOS).size, 48);
});
