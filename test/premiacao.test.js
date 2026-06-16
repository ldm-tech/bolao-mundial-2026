import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posicaoMeio, calculaPremios } from '../src/premiacao.js';

const CFG = {
  valorAposta: 80,
  distribuicao: [
    { chave: 'primeiro', rotulo: '1º Lugar', fonte: 'geral', posicao: 1, pct: 0.6 },
    { chave: 'segundo', rotulo: '2º Lugar', fonte: 'geral', posicao: 2, pct: 0.2 },
    { chave: 'terceiro', rotulo: '3º Lugar', fonte: 'geral', posicao: 3, pct: 0.1 },
    { chave: 'primeiraFase', rotulo: 'Campeão da 1ª Fase', fonte: 'faseGrupos', posicao: 1, pct: 0.05 },
    { chave: 'meio', rotulo: 'Consolação (meio)', fonte: 'meio', posicao: null, pct: 0.05 },
  ],
};

test('posicaoMeio = teto(N/2): 102->51, 30->15, 27->14, 0->0', () => {
  assert.equal(posicaoMeio(102), 51);
  assert.equal(posicaoMeio(30), 15);
  assert.equal(posicaoMeio(27), 14);
  assert.equal(posicaoMeio(0), 0);
});

function fakeRanking(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1, nome: `J${i + 1}`, total: 1000 - i, posicao: i + 1,
  }));
}

test('calculaPremios mapeia cada premio ao jogador certo', () => {
  const geral = fakeRanking(6);
  const faseGrupos = [{ id: 4, nome: 'J4', total: 300, posicao: 1 }, ...fakeRanking(6).slice(1)];
  const r = calculaPremios({ cfg: CFG, geral, faseGrupos, nPagantes: 6 });
  const by = Object.fromEntries(r.premios.map((p) => [p.chave, p]));
  assert.equal(by.primeiro.jogador.id, 1);
  assert.equal(by.terceiro.jogador.id, 3);
  assert.equal(by.primeiraFase.jogador.id, 4);
  assert.equal(by.meio.jogador.id, 3); // teto(6/2)=3 -> geral[2]
  assert.equal(r.pool, 480); // 80 * 6
  assert.equal(by.primeiro.valorReais, 288); // 480 * 0.6
});

test('sem pagantes: pool 0, mas meio mostra o parcial (teto(total/2))', () => {
  const geral = fakeRanking(3);
  const r = calculaPremios({ cfg: CFG, geral, faseGrupos: geral, nPagantes: 0 });
  assert.equal(r.pool, 0); // R$ depende dos pagantes
  const meio = r.premios.find((p) => p.chave === 'meio');
  assert.equal(meio.posicao, 2); // teto(3/2) sobre os participantes
  assert.equal(meio.jogador.id, 2); // geral[1], independente de pagantes
});

test('meio usa total de participantes, nao pagantes (102 -> 51)', () => {
  const geral = fakeRanking(102);
  const r = calculaPremios({ cfg: CFG, geral, faseGrupos: geral, nPagantes: 0 });
  const meio = r.premios.find((p) => p.chave === 'meio');
  assert.equal(meio.posicao, 51);
  assert.equal(meio.jogador.id, 51);
});
