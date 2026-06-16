import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montaSecador } from '../src/secador.js';

const palpites = [
  { nome: 'Ana', gols_casa: 6, gols_fora: 1 }, // crava agora (6x1)
  { nome: 'Bruno', gols_casa: 6, gols_fora: 1 }, // crava agora
  { nome: 'Carla', gols_casa: 7, gols_fora: 1 }, // falta 1 (Alemanha)
  { nome: 'Davi', gols_casa: 6, gols_fora: 2 }, // falta 1 (Curacau)
  { nome: 'Edu', gols_casa: 8, gols_fora: 3 }, // falta 4
  { nome: 'Fabi', gols_casa: 5, gols_fora: 1 }, // estourou casa (5<6) -> fora
  { nome: 'Gui', gols_casa: 6, gols_fora: 0 }, // estourou fora (0<1) -> fora
  { nome: 'Hugo', gols_casa: null, gols_fora: null }, // sem palpite -> fora
];

test('cravando = palpite igual ao placar atual, ordenado por nome', () => {
  const s = montaSecador(palpites, 6, 1);
  assert.deepEqual(s.cravando.map((c) => c.nome), ['Ana', 'Bruno']);
});

test('disputa exclui estourados/nulos e ordena por menos gols faltando', () => {
  const s = montaSecador(palpites, 6, 1);
  assert.deepEqual(s.disputa.map((d) => d.nome), ['Carla', 'Davi', 'Edu']);
  assert.equal(s.disputa[0].faltam, 1);
  assert.equal(s.disputa[0].faltamCasa, 1);
  assert.equal(s.disputa[0].faltamFora, 0);
  assert.equal(s.disputa[2].faltam, 4); // Edu 8x3 sobre 6x1
});

test('topN limita a disputa e conta o restante', () => {
  const muitos = Array.from({ length: 12 }, (_, i) => ({ nome: 'J' + i, gols_casa: 6, gols_fora: 2 + i }));
  const s = montaSecador(muitos, 6, 1, 8);
  assert.equal(s.disputa.length, 8);
  assert.equal(s.restante, 4);
});

test('0x0: todos com os dois lados >=0 entram (placar baixo = muita gente)', () => {
  const s = montaSecador(palpites, 0, 0);
  // todos menos o sem-palpite (Hugo) sao alcancaveis a partir de 0x0
  assert.equal(s.cravando.length + s.disputa.length, 7);
});
