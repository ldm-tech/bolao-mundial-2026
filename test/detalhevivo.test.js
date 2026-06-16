import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMinuto,
  golsDoSummary,
  cartoesDoSummary,
  estatisticasDoSummary,
  travesDoSummary,
} from '../src/detalhevivo.js';

test('parseMinuto entende formatos da ESPN', () => {
  assert.deepEqual(parseMinuto("68'"), { minuto: 68, acrescimo: 0 });
  assert.deepEqual(parseMinuto("45+2'"), { minuto: 45, acrescimo: 2 });
  assert.deepEqual(parseMinuto("90'+3'"), { minuto: 90, acrescimo: 3 });
  assert.deepEqual(parseMinuto('HT'), { minuto: null, acrescimo: 0 });
  assert.deepEqual(parseMinuto(null), { minuto: null, acrescimo: 0 });
});

const summary = {
  keyEvents: [
    {
      type: { type: 'goal' }, scoringPlay: true, clock: { displayValue: "9'" },
      team: { id: '203' }, participants: [{ athlete: { displayName: 'Julián Quiñones' } }],
      text: 'Goal! Mexico 1, South Africa 0. Julián Quiñones right footed shot.',
    },
    {
      type: { type: 'penalty-goal' }, scoringPlay: true, clock: { displayValue: "63'" },
      team: { id: '999' }, participants: [{ athlete: { displayName: 'Fulano Pen' } }],
      text: 'Goal! Penalty scored by Fulano Pen.',
    },
    { type: { type: 'yellow-card' }, scoringPlay: false, clock: { displayValue: "70'" }, team: { id: '203' } },
  ],
};

test('golsDoSummary orienta pelo nosso mando e ignora nao-gols', () => {
  // nosso mandante = ESPN home (mesmoMando true): gol do 203 vai pra casa
  const r = golsDoSummary(summary, '203', true);
  assert.deepEqual(r.golsCasa.map((g) => g.nome), ['Julián Quiñones']);
  assert.deepEqual(r.golsFora.map((g) => g.nome), ['Fulano Pen']);
  assert.equal(r.golsCasa[0].min, 9);
  assert.equal(r.golsFora[0].tipo, 'PENALTY');
});

test('golsDoSummary inverte quando o mando e invertido', () => {
  const r = golsDoSummary(summary, '203', false);
  assert.deepEqual(r.golsFora.map((g) => g.nome), ['Julián Quiñones']);
  assert.deepEqual(r.golsCasa.map((g) => g.nome), ['Fulano Pen']);
});

test('golsDoSummary tolera summary vazio', () => {
  assert.deepEqual(golsDoSummary(null, '1', true), { golsCasa: [], golsFora: [] });
  assert.deepEqual(golsDoSummary({}, '1', true), { golsCasa: [], golsFora: [] });
});

test('cartoesDoSummary separa amarelo/vermelho e orienta pelo mando', () => {
  const sum = {
    keyEvents: [
      { type: { type: 'yellow-card' }, clock: { displayValue: "17'" }, team: { id: '203' }, participants: [{ athlete: { displayName: 'Fulano' } }] },
      { type: { type: 'red-card' }, clock: { displayValue: "80'" }, team: { id: '999' }, participants: [{ athlete: { displayName: 'Beltrano' } }] },
      { type: { type: 'yellow-red-card' }, clock: { displayValue: "90'" }, team: { id: '203' }, participants: [{ athlete: { displayName: '2 Amarelos' } }] },
      { type: { type: 'goal' }, scoringPlay: true, clock: { displayValue: "9'" }, team: { id: '203' } },
    ],
  };
  const r = cartoesDoSummary(sum, '203', true);
  assert.deepEqual(r.cartoesCasa.map((c) => c.nome + '/' + c.cor), ['Fulano/A', '2 Amarelos/V']);
  assert.deepEqual(r.cartoesFora.map((c) => c.nome + '/' + c.cor), ['Beltrano/V']);
});

const boxscore = {
  boxscore: {
    teams: [
      {
        team: { id: '203' },
        statistics: [
          { name: 'possessionPct', displayValue: '60.5' },
          { name: 'totalShots', displayValue: '16' },
          { name: 'shotsOnTarget', displayValue: '4' },
          { name: 'saves', displayValue: '2' },
          { name: 'wonCorners', displayValue: '3' },
        ],
      },
      {
        team: { id: '467' },
        statistics: [
          { name: 'possessionPct', displayValue: '39.5' },
          { name: 'totalShots', displayValue: '7' },
          { name: 'shotsOnTarget', displayValue: '1' },
          { name: 'saves', displayValue: '3' },
          { name: 'wonCorners', displayValue: '5' },
        ],
      },
    ],
  },
};

test('estatisticasDoSummary orienta pelo nosso mando (casa = ESPN home)', () => {
  const r = estatisticasDoSummary(boxscore, '203', true);
  assert.equal(r.casa.posse, 61); // 60.5 arredonda
  assert.equal(r.casa.chutes, 16);
  assert.equal(r.casa.noGol, 4);
  assert.equal(r.casa.defesas, 2);
  assert.equal(r.casa.escanteios, 3);
  assert.equal(r.fora.chutes, 7);
});

test('estatisticasDoSummary inverte quando o mando e invertido', () => {
  const r = estatisticasDoSummary(boxscore, '203', false);
  assert.equal(r.casa.chutes, 7); // o ESPN away vira nossa casa
  assert.equal(r.fora.chutes, 16);
});

test('estatisticasDoSummary devolve null sem boxscore', () => {
  assert.equal(estatisticasDoSummary(null, '1', true), null);
  assert.equal(estatisticasDoSummary({}, '1', true), null);
  assert.equal(estatisticasDoSummary({ boxscore: { teams: [{}] } }, '1', true), null);
});

test('travesDoSummary cobre bar e left/right post, extrai autor e minuto', () => {
  const sum = {
    commentary: [
      { time: { displayValue: '' }, text: 'Lineups are announced.' },
      { time: { displayValue: "23'" }, text: 'John Yeboah (Ecuador) hits the bar with a left footed shot from outside the box.' },
      { time: { displayValue: "30'" }, text: 'Mehdi Taremi (IR Iran) hits the right post with a right footed shot from outside the box.' },
      { time: { displayValue: "52'" }, text: 'Elye Wahi (Côte d\'Ivoire) hits the left post with a header.' },
      { time: { displayValue: "70'" }, text: 'Fulano (Brazil) wins a free kick in the attacking half.' },
      { time: { displayValue: "75'" }, text: 'Beltrano (Spain) shot is saved; the keeper covers his post.' },
    ],
  };
  const r = travesDoSummary(sum);
  assert.equal(r.length, 3); // bar + right post + left post; ignora free kick e "covers his post"
  assert.deepEqual(r.map((t) => t.nome), ['John Yeboah', 'Mehdi Taremi', 'Elye Wahi']);
  assert.deepEqual(r.map((t) => t.min), [23, 30, 52]);
  assert.equal(r[1].time, 'IR Iran');
});

test('travesDoSummary tolera commentary vazio', () => {
  assert.deepEqual(travesDoSummary(null), []);
  assert.deepEqual(travesDoSummary({}), []);
});
