import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agrupaPorDia } from '../src/jogos-view.js';

const mk = (numero, data, estadoVivo = null) => ({ jogo: { numero, data }, estadoVivo });

test('agrupaPorDia agrupa por data e ordena cronologicamente', () => {
  const lista = [mk(3, '2026-06-12'), mk(1, '2026-06-11'), mk(2, '2026-06-11')];
  const { dias } = agrupaPorDia(lista, '2026-06-11');
  assert.deepEqual(dias.map((d) => d.data), ['2026-06-11', '2026-06-12']);
  assert.equal(dias[0].jogos.length, 2);
  assert.equal(dias[1].jogos.length, 1);
});

test('diaAberto prioriza o dia com jogo AO VIVO', () => {
  const lista = [mk(1, '2026-06-11'), mk(2, '2026-06-13', 'ao_vivo'), mk(3, '2026-06-12')];
  const { diaAberto } = agrupaPorDia(lista, '2026-06-11');
  assert.equal(diaAberto, '2026-06-13');
});

test('sem ao vivo, abre o dia de hoje', () => {
  const lista = [mk(1, '2026-06-11'), mk(2, '2026-06-12'), mk(3, '2026-06-13')];
  const { diaAberto } = agrupaPorDia(lista, '2026-06-12');
  assert.equal(diaAberto, '2026-06-12');
});

test('sem ao vivo e hoje sem jogos, abre o próximo dia futuro', () => {
  const lista = [mk(1, '2026-06-11'), mk(2, '2026-06-15')];
  const { diaAberto } = agrupaPorDia(lista, '2026-06-13');
  assert.equal(diaAberto, '2026-06-15');
});

test('tudo no passado, abre o último dia', () => {
  const lista = [mk(1, '2026-06-11'), mk(2, '2026-06-12')];
  const { diaAberto } = agrupaPorDia(lista, '2026-06-20');
  assert.equal(diaAberto, '2026-06-12');
});

test('temAoVivo marca o dia certo', () => {
  const lista = [mk(1, '2026-06-11'), mk(2, '2026-06-11', 'ao_vivo')];
  const { dias } = agrupaPorDia(lista, '2026-06-11');
  assert.equal(dias[0].temAoVivo, true);
});
