import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  feedbackHabilitado,
  linearConfigurado,
  rateLimitOk,
  criaIssueLinear,
} from '../src/feedback.js';

test('feedbackHabilitado: so dominios ldm.com.br', () => {
  assert.equal(feedbackHabilitado('ldm.com.br'), true);
  assert.equal(feedbackHabilitado('bolao-pedreira.demo.ldm.com.br'), true);
  assert.equal(feedbackHabilitado('bolao.topazio.eng.br'), false);
  assert.equal(feedbackHabilitado('notldm.com.br'), false);
  assert.equal(feedbackHabilitado('ldm.com.br.attacker.com'), false);
  assert.equal(feedbackHabilitado(''), false);
});

test('linearConfigurado exige key + (team key ou id)', () => {
  assert.equal(linearConfigurado({}), false);
  assert.equal(linearConfigurado({ LINEAR_API_KEY: 'k' }), false);
  assert.equal(linearConfigurado({ LINEAR_API_KEY: 'k', LINEAR_TEAM_KEY: 'LDM' }), true);
  assert.equal(linearConfigurado({ LINEAR_API_KEY: 'k', LINEAR_TEAM_ID: 'uuid' }), true);
});

test('rateLimitOk permite 5 e bloqueia o 6o na janela', () => {
  const store = new Map();
  const ip = '1.2.3.4';
  for (let i = 0; i < 5; i += 1) assert.equal(rateLimitOk(ip, 1000 + i, store), true);
  assert.equal(rateLimitOk(ip, 1006, store), false);
  // passada a janela (60s), libera de novo
  assert.equal(rateLimitOk(ip, 1000 + 61000, store), true);
});

function fakeFetch(cap) {
  return async (_url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.query.includes('teams')) {
      return { json: async () => ({ data: { teams: { nodes: [{ id: 'team-uuid-1', key: 'LDM' }] } } }) };
    }
    cap.body = body;
    cap.headers = opts.headers;
    return {
      json: async () => ({
        data: { issueCreate: { success: true, issue: { url: 'https://linear.app/ldm/issue/LDM-1', identifier: 'LDM-1' } } },
      }),
    };
  };
}

test('criaIssueLinear: resolve team pela key, monta titulo e descricao', async () => {
  const cap = {};
  const env = { LINEAR_API_KEY: 'lin_api_x', LINEAR_TEAM_KEY: 'LDM' };
  const r = await criaIssueLinear(
    { tipo: 'Bug', mensagem: 'Botao quebrado\nsegunda linha', nome: 'Ana', url: 'https://x/y', ua: 'UA', origem: 'Pedreira' },
    { env, fetchFn: fakeFetch(cap) },
  );
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://linear.app/ldm/issue/LDM-1');
  assert.equal(cap.body.variables.input.title, '[Pedreira][Bug] Botao quebrado');
  assert.equal(cap.body.variables.input.teamId, 'team-uuid-1');
  assert.match(cap.body.variables.input.description, /Ana/);
  assert.match(cap.body.variables.input.description, /https:\/\/x\/y/);
  assert.equal(cap.headers.Authorization, 'lin_api_x');
});

test('criaIssueLinear: lanca em erro do Linear', async () => {
  const env = { LINEAR_API_KEY: 'k', LINEAR_TEAM_ID: 't' };
  const fetchFn = async () => ({ json: async () => ({ errors: [{ message: 'bad' }] }) });
  await assert.rejects(
    criaIssueLinear({ tipo: 'Bug', mensagem: 'x', origem: 'P' }, { env, fetchFn }),
    /issueCreate falhou/,
  );
});
