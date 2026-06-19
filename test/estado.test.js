import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDoPlacar } from '../src/ranking.js';

// jogo 12/06/2026 22:00 BRT -> inicio em UTC
const INICIO = Date.UTC(2026, 5, 13, 1, 0);
const MIN = 60 * 1000;

test('FINISHED sempre vira parcial (encerrado, aguarda confirmacao)', () => {
  assert.equal(estadoDoPlacar('ao_vivo', 'FINISHED', '2026-06-12', '22:00', INICIO + 90 * MIN), 'parcial');
});

test('IN_PLAY confia no status (ao vivo)', () => {
  assert.equal(estadoDoPlacar('ao_vivo', 'IN_PLAY', '2026-06-12', '22:00', INICIO - 5 * MIN), 'ao_vivo');
});

test('status atrasado, mas o jogo ja comecou pelo relogio -> ao vivo', () => {
  assert.equal(estadoDoPlacar('ao_vivo', 'TIMED', '2026-06-12', '22:00', INICIO + 30 * MIN), 'ao_vivo');
});

test('antes do inicio -> parcial', () => {
  assert.equal(estadoDoPlacar('ao_vivo', 'TIMED', '2026-06-12', '22:00', INICIO - 10 * MIN), 'parcial');
});

test('muito depois da janela (API travada) -> parcial', () => {
  assert.equal(estadoDoPlacar('ao_vivo', 'TIMED', '2026-06-12', '22:00', INICIO + 200 * MIN), 'parcial');
});

test('placar manual e sempre definitivo, mesmo dentro da janela do relogio', () => {
  // o admin informou de proposito: nao volta a "ao vivo" so porque o relogio
  // ainda esta na janela do jogo (era a causa do "ressuscitar" ao atualizar).
  assert.equal(estadoDoPlacar('manual', null, '2026-06-12', '22:00', INICIO + 10 * MIN), null);
});

test('placar manual fora da janela -> definitivo (null, sem selo)', () => {
  assert.equal(estadoDoPlacar('manual', null, '2026-06-12', '22:00', INICIO + 200 * MIN), null);
});

test('placar manual antes do inicio -> definitivo (null)', () => {
  assert.equal(estadoDoPlacar('manual', null, '2026-06-12', '22:00', INICIO - 10 * MIN), null);
});

test('sem placar (fonte nenhum) -> null', () => {
  assert.equal(estadoDoPlacar('nenhum', null, '2026-06-12', '22:00', INICIO + 10 * MIN), null);
});
