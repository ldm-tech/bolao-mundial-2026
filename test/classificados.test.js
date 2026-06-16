import { test } from 'node:test';
import assert from 'node:assert/strict';
import { popularidadeDe } from '../src/classificados.js';

test('popularidadeDe: conta 1x por pessoa, calcula % e ordena desc', () => {
  const listas = [
    ['Brasil', 'Portugal'],
    ['Brasil', 'Brasil', 'Argentina'], // duplicata na mesma pessoa conta 1x
    ['Brasil'],
    ['Portugal'],
  ];
  const r = popularidadeDe(listas);
  const by = Object.fromEntries(r.map((x) => [x.label, x]));
  assert.equal(by['Brasil'].count, 3);
  assert.equal(by['Brasil'].pct, 75); // 3/4
  assert.equal(by['Portugal'].count, 2);
  assert.equal(by['Portugal'].pct, 50);
  assert.equal(by['Argentina'].count, 1);
  assert.equal(by['Argentina'].pct, 25);
  assert.equal(r[0].label, 'Brasil'); // ordenado por count desc
});

test('popularidadeDe: ignora nulos/vazios e desempata por nome', () => {
  const r = popularidadeDe([['Brasil', null], ['Argentina', ''], []]);
  // Brasil e Argentina empatam em 1 -> ordem alfabetica
  assert.deepEqual(r.map((x) => x.label), ['Argentina', 'Brasil']);
  assert.equal(r[0].pct, 33); // 1/3 arredondado
});

test('popularidadeDe: lista vazia nao quebra', () => {
  assert.deepEqual(popularidadeDe([]), []);
});
