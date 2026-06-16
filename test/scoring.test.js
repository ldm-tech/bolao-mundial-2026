import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pontosPlacar,
  bonusMataMata,
  pontosEspeciais,
  normalizaTime,
  VALORES,
} from '../src/scoring.js';

const placar = (gc, gf) => ({ gols_casa: gc, gols_fora: gf });

test('pontosPlacar: placar exato vale 35', () => {
  assert.equal(pontosPlacar(placar(2, 1), placar(2, 1)), 35);
  assert.equal(pontosPlacar(placar(0, 0), placar(0, 0)), 35);
});

test('pontosPlacar: vencedor + gols de uma equipe vale 20', () => {
  // acertou casa vence + gols da casa (2), errou gols do fora (1 vs 0)
  assert.equal(pontosPlacar(placar(2, 1), placar(2, 0)), 20);
  // acertou casa vence + gols do fora (0), errou gols da casa
  assert.equal(pontosPlacar(placar(3, 0), placar(2, 0)), 20);
  // empate com um placar batendo de leve: 1x1 palpite, real 1x1 seria exato;
  // empate 2x2 palpite vs 1x1 real -> empate certo, nenhum gol bate -> 10 (abaixo)
});

test('pontosPlacar: vencedor/empate sem acertar gols vale 10', () => {
  assert.equal(pontosPlacar(placar(3, 1), placar(2, 0)), 10); // casa vence, gols errados
  assert.equal(pontosPlacar(placar(2, 2), placar(1, 1)), 10); // empate, gols errados
});

test('pontosPlacar: errou resultado mas acertou gol de uma equipe vale 5', () => {
  // palpite casa vence 2x1, real empate 2x2 -> resultado errado, gols casa batem (2)
  assert.equal(pontosPlacar(placar(2, 1), placar(2, 2)), 5);
  // palpite fora vence 0x1, real casa vence 0x... nao: palpite 1x0 (casa), real 1x2 (fora) gols casa batem
  assert.equal(pontosPlacar(placar(1, 0), placar(1, 2)), 5);
});

test('pontosPlacar: nada certo vale 0', () => {
  assert.equal(pontosPlacar(placar(0, 3), placar(2, 1)), 0);
});

test('pontosPlacar: placar incompleto vale 0', () => {
  assert.equal(pontosPlacar(placar(2, null), placar(2, 1)), 0);
  assert.equal(pontosPlacar(null, placar(2, 1)), 0);
  assert.equal(pontosPlacar(placar(2, 1), null), 0);
});

test('bonusMataMata: confronto certo com mando certo soma confronto + 2 selecoes', () => {
  const r = bonusMataMata(
    'oitavas',
    { time_casa: 'Brasil', time_fora: 'Argentina' },
    { time_casa: 'Brasil', time_fora: 'Argentina' }, // mesmos lados
  );
  assert.deepEqual(r, { confronto: 50, selecao: 50, total: 100 });
});

test('bonusMataMata: times certos com mando TROCADO nao pontuam nada', () => {
  const r = bonusMataMata(
    'oitavas',
    { time_casa: 'Brasil', time_fora: 'Argentina' },
    { time_casa: 'Argentina', time_fora: 'Brasil' }, // lados invertidos
  );
  assert.deepEqual(r, { confronto: 0, selecao: 0, total: 0 });
});

test('bonusMataMata: acertou so uma selecao da chave', () => {
  const r = bonusMataMata(
    '1/16',
    { time_casa: 'Brasil', time_fora: 'Chile' },
    { time_casa: 'Brasil', time_fora: 'Uruguai' },
  );
  assert.deepEqual(r, { confronto: 0, selecao: 15, total: 15 });
});

test('bonusMataMata: nenhuma selecao certa', () => {
  const r = bonusMataMata(
    'quartas',
    { time_casa: 'Brasil', time_fora: 'Chile' },
    { time_casa: 'Franca', time_fora: 'Uruguai' },
  );
  assert.deepEqual(r, { confronto: 0, selecao: 0, total: 0 });
});

test('bonusMataMata: normaliza nomes divergentes entre planilhas', () => {
  const r = bonusMataMata(
    'semis',
    { time_casa: 'Qatar', time_fora: 'Rep. Tcheca' },
    { time_casa: 'Catar', time_fora: 'República Tcheca' },
  );
  assert.deepEqual(r, { confronto: 100, selecao: 100, total: 200 });
});

test('bonusMataMata: fase de grupos nao tem bonus', () => {
  const r = bonusMataMata(
    'grupos',
    { time_casa: 'Brasil', time_fora: 'Argentina' },
    { time_casa: 'Brasil', time_fora: 'Argentina' },
  );
  assert.deepEqual(r, { confronto: 0, selecao: 0, total: 0 });
});

test('bonusMataMata: so pontua o lado (mando) que casa', () => {
  // mandante certo (Brasil), visitante errado -> 1 selecao, sem confronto
  const r = bonusMataMata(
    '1/16',
    { time_casa: 'Brasil', time_fora: 'Brasil' },
    { time_casa: 'Brasil', time_fora: 'Argentina' },
  );
  assert.deepEqual(r, { confronto: 0, selecao: 15, total: 15 });
});

test('pontosEspeciais: artilheiro, finalistas e campeao', () => {
  const palpite = {
    artilheiro: 'Julián Álvarez',
    campeao: 'Argentina',
    finalista_1: 'Espanha',
    finalista_2: 'Argentina',
  };
  const real = {
    artilheiro: 'Julian Alvarez',
    campeao: 'Argentina',
    finalistas: ['Argentina', 'Espanha'], // ordem nao importa
  };
  const r = pontosEspeciais(palpite, real);
  assert.equal(r.artilheiro, 100);
  assert.equal(r.finalistas, 200);
  assert.equal(r.campeao, 500);
  assert.equal(r.total, 800);
});

test('pontosEspeciais: artilheiro pontua com grafias variantes (mesmo mapa do /artilheiros)', () => {
  // artilheiro oficial cadastrado como "Mbappé"; palpites escritos de varios jeitos
  const real = { artilheiro: 'Mbappé', campeao: null, finalistas: [] };
  for (const grafia of ['Mbappe', 'Kylian Mbappé', 'Mbape', 'MBAPPÉ', 'mpape']) {
    assert.equal(pontosEspeciais({ artilheiro: grafia }, real).artilheiro, 100, `falhou p/ "${grafia}"`);
  }
  // jogador diferente nao pontua
  assert.equal(pontosEspeciais({ artilheiro: 'Harry Kane' }, real).artilheiro, 0);
});

test('pontosEspeciais: finalistas so pontua se acertar os DOIS', () => {
  const palpite = { finalista_1: 'Espanha', finalista_2: 'Brasil' };
  const real = { finalistas: ['Espanha', 'Argentina'] };
  assert.equal(pontosEspeciais(palpite, real).finalistas, 0);
});

test('pontosEspeciais: sem resultado retorna zero', () => {
  assert.equal(pontosEspeciais({ campeao: 'Brasil' }, {}).total, 0);
});

test('normalizaTime: distingue Suica de Suecia', () => {
  assert.notEqual(normalizaTime('Suíça'), normalizaTime('Suécia'));
});

test('VALORES expoe a tabela de pontos do regulamento', () => {
  assert.equal(VALORES.exato, 35);
  assert.equal(VALORES.campeao, 500);
  assert.equal(VALORES.bonus.semis.confronto, 100);
});
